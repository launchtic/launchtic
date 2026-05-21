import { NextRequest, NextResponse } from "next/server";
import { db } from "@launchtic/database";
import { redis } from "../../../../lib/redis";
import { getPayPalProvider } from "../../../../lib/payments/registry";
import { grantOrderResources } from "../../../../lib/resources";
import { recordCouponUsage } from "../../../../lib/coupons";
import type { CheckoutInput, BumpPlanRow, PricePlanRow } from "../../../../lib/payments/types";

function ok(data: unknown) { return NextResponse.json({ success: true, data }); }
function fail(msg: string, status = 400) { return NextResponse.json({ success: false, error: msg }, { status }); }

async function getNextStepUrl(funnelStepId: string, host: string): Promise<string | null> {
  const current = await db.funnelStep.findUnique({ where: { id: funnelStepId }, select: { funnelId: true, order: true } });
  if (!current) return null;
  const next = await db.funnelStep.findFirst({
    where: { funnelId: current.funnelId, order: { gt: current.order } },
    orderBy: { order: "asc" },
    select: { slug: true },
  });
  if (!next) return null;
  const protocol = process.env.NODE_ENV === "development" ? "http" : "https";
  return `${protocol}://${host}/${next.slug}`;
}

export async function POST(req: NextRequest) {
  try {
    const { paypalSubscriptionId } = await req.json();
    if (!paypalSubscriptionId) return fail("paypalSubscriptionId is required");

    // Check for duplicate activation (idempotency)
    const existingSub = await db.subscription.findFirst({
      where: { providerSubId: paypalSubscriptionId },
      select: { id: true, orders: { select: { id: true, funnelStepId: true }, take: 1 } },
    });
    if (existingSub) {
      const host = req.headers.get("host") ?? "localhost:3001";
      const funnelStepId = existingSub.orders[0]?.funnelStepId;
      return ok({ nextStepUrl: funnelStepId ? await getNextStepUrl(funnelStepId, host) : null });
    }

    // Read pending checkout data from Redis (TTL 15 min)
    const raw = await redis.get(`paypal:sub:${paypalSubscriptionId}`);
    if (!raw) return fail("Checkout session expired or not found. Please try again.", 410);

    const { input, planRow }: { input: CheckoutInput; planRow: PricePlanRow } = JSON.parse(raw);

    // Verify subscription is approved with PayPal
    const provider = await getPayPalProvider(input.workspaceId);
    const { status } = await provider.getSubscription(paypalSubscriptionId);

    const acceptableStatuses = ["ACTIVE", "APPROVED", "TRIALING"];
    if (!acceptableStatuses.includes(status)) return fail(`PayPal subscription status: ${status}`, 402);

    // Build order data
    const bumpPlans: BumpPlanRow[] = input.bumpPlans ?? [];
    const oneTimeBumps = bumpPlans.filter(b => b.type === "ONE_TIME");
    const discountAmount = input.discountAmount ?? 0;
    const finalAmount = Math.max(0, planRow.amount - discountAmount);
    const oneTimeBumpTotal = oneTimeBumps.reduce((s, b) => s + b.amount + (b.shippingFee ?? 0), 0);
    const trialDays = planRow.trialDays ?? 0;
    const currency = planRow.currency;

    const contactSnapshot = await db.contact.findUnique({
      where: { id: input.contactId },
      select: { email: true, firstName: true, lastName: true },
    });

    const bumpItemsData = oneTimeBumps.length > 0
      ? oneTimeBumps.map(b => ({
          orderBumpId: b.orderBumpId, planId: b.planId ?? null,
          physicalProductId: b.physicalProductId ?? null, label: b.label ?? null,
          productName: b.productName ?? null, planName: b.planName ?? null,
          unitPrice: b.amount, shippingFee: b.shippingFee ?? 0,
          total: b.amount + (b.shippingFee ?? 0), currency: b.currency,
        }))
      : undefined;

    const trialEnd = trialDays > 0 ? new Date(Date.now() + trialDays * 86400_000) : null;
    const isTrial = trialEnd ? trialEnd.getTime() > Date.now() : false;

    // Create DB subscription and order now that user approved
    const dbSub = await db.subscription.create({
      data: {
        workspaceId: input.workspaceId, contactId: input.contactId, funnelStepId: input.funnelStepId,
        stepPricePlanId: input.pricePlanId ?? null,
        status: isTrial ? "TRIALING" : "ACTIVE",
        paymentProvider: "paypal", providerSubId: paypalSubscriptionId,
        trialEnd,
        planSnapshot: {
          planName: planRow.name, amount: planRow.amount, finalAmount,
          currency, interval: planRow.interval ?? "month",
          trialDays: trialDays > 0 ? trialDays : null,
        },
      },
    });

    const orderTotal = finalAmount + oneTimeBumpTotal;
    const orderStatus = isTrial ? "TRIAL" : "PAID";

    const order = await db.order.create({
      data: {
        workspaceId: input.workspaceId, contactId: input.contactId, funnelStepId: input.funnelStepId,
        stepPricePlanId: input.pricePlanId ?? null, couponCode: input.couponCode ?? null,
        orderItemSnapshot: input.orderItemSnapshot, bumpItems: bumpItemsData,
        subscriptionId: dbSub.id,
        status: orderStatus, paymentProvider: "paypal", paymentMethod: "paypal", paymentMethodId: null,
        providerOrderId: paypalSubscriptionId,
        subtotal: planRow.amount, discountAmount,
        total: orderTotal, currency,
        contactSnapshot: contactSnapshot ?? undefined,
        shippingAddress: input.shippingAddress as any,
      },
    });

    // For FREE_TRIAL: subscription amount is not charged today, but setup_fee (bump) is.
    // For regular subscription: full orderTotal is charged today.
    const chargedToday = isTrial ? oneTimeBumpTotal : orderTotal;

    if (chargedToday > 0) {
      await db.$transaction([
        db.transaction.create({
          data: { orderId: order.id, type: "SALE", amount: chargedToday, currency, reference: paypalSubscriptionId, status: "COMPLETED" },
        }),
        db.contactEvent.create({
          data: { contactId: input.contactId, type: "PURCHASE", data: { orderId: order.id, amount: chargedToday, currency } },
        }),
      ]);
    }

    // Coupon usage is recorded once on first PAID/TRIAL creation. Trial
    // converting to PAID later doesn't re-count (no re-creation happens).
    await recordCouponUsage(input.workspaceId, input.couponCode);

    // Grant configured resources for both PAID and TRIAL orders — trial users
    // get access immediately; access is later revoked if the trial cancels.
    await grantOrderResources(order.id).catch((err) =>
      console.error("[/api/checkout/activate] grantOrderResources", err),
    );

    // Delete Redis key — no longer needed
    await redis.del(`paypal:sub:${paypalSubscriptionId}`);

    const host = req.headers.get("host") ?? "localhost:3001";
    return ok({ nextStepUrl: input.funnelStepId ? await getNextStepUrl(input.funnelStepId, host) : null });
  } catch (error) {
    console.error("[/api/checkout/activate]", error);
    return fail(error instanceof Error ? error.message : "Internal error", 500);
  }
}
