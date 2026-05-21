import { NextRequest, NextResponse } from "next/server";
import { db } from "@launchtic/database";
import { redis } from "../../../../lib/redis";
import { getPayPalProvider } from "../../../../lib/payments/registry";
import { grantOrderResources } from "../../../../lib/resources";
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
    const { paypalOrderId } = await req.json();
    if (!paypalOrderId) return fail("paypalOrderId is required");

    // Read pending checkout data from Redis (TTL 15 min)
    const raw = await redis.get(`paypal:order:${paypalOrderId}`);
    if (!raw) return fail("Checkout session expired or not found. Please try again.", 410);

    const { input, planRow }: { input: CheckoutInput; planRow: PricePlanRow } = JSON.parse(raw);

    // Check for duplicate capture (idempotency)
    const existing = await db.order.findFirst({
      where: { providerOrderId: paypalOrderId, status: "PAID" },
      select: { id: true, funnelStepId: true },
    });
    if (existing) {
      const host = req.headers.get("host") ?? "localhost:3001";
      return ok({ nextStepUrl: existing.funnelStepId ? await getNextStepUrl(existing.funnelStepId, host) : null });
    }

    // Capture the PayPal order
    const provider = await getPayPalProvider(input.workspaceId);
    const { status } = await provider.captureOrder(paypalOrderId);
    if (status !== "COMPLETED") return fail(`PayPal capture status: ${status}`, 402);

    // Build order data
    const bumpPlans: BumpPlanRow[] = input.bumpPlans ?? [];
    const oneTimeBumps = bumpPlans.filter(b => b.type === "ONE_TIME");
    const discountAmount = input.discountAmount ?? 0;
    const subtotal = planRow.amount;
    const shippingFee = input.shippingFee ?? 0;
    const oneTimeBumpTotal = oneTimeBumps.reduce((s, b) => s + b.amount + (b.shippingFee ?? 0), 0);
    // Subscription plan with finalAmount=0: this PayPal order charged only the bump.
    // Order total reflects bump only; the free subscription is created here too.
    const isFreeSubWithBump = planRow.type !== "ONE_TIME" && Math.max(0, subtotal - discountAmount) === 0;
    const total = isFreeSubWithBump
      ? oneTimeBumpTotal
      : Math.max(0, subtotal + shippingFee + oneTimeBumpTotal - discountAmount);
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

    let subscriptionId: string | null = null;
    if (isFreeSubWithBump) {
      const dbSub = await db.subscription.create({
        data: {
          workspaceId: input.workspaceId, contactId: input.contactId, funnelStepId: input.funnelStepId,
          stepPricePlanId: planRow.id, status: "ACTIVE", paymentProvider: "free",
          providerSubId: `free_${Date.now()}`, trialEnd: null,
          planSnapshot: { planName: planRow.name, amount: planRow.amount, finalAmount: 0, discountAmount, currency: planRow.currency, interval: planRow.interval ?? "month", trialDays: null },
        },
      });
      subscriptionId = dbSub.id;
    }

    // Create order + transaction atomically now that payment is confirmed
    const order = await db.order.create({
      data: {
        workspaceId: input.workspaceId, contactId: input.contactId, funnelStepId: input.funnelStepId,
        stepPricePlanId: input.pricePlanId ?? null, couponCode: input.couponCode ?? null,
        orderItemSnapshot: input.orderItemSnapshot, bumpItems: bumpItemsData,
        subscriptionId,
        status: "PAID", paymentProvider: "paypal", paymentMethod: "paypal", paymentMethodId: null,
        providerOrderId: paypalOrderId,
        subtotal, discountAmount, shippingFee, total, currency,
        contactSnapshot: contactSnapshot ?? undefined,
        shippingAddress: input.shippingAddress as any,
      },
    });

    await db.$transaction([
      db.transaction.create({
        data: { orderId: order.id, type: "SALE", amount: total, currency, reference: paypalOrderId, status: "COMPLETED" },
      }),
      db.contactEvent.create({
        data: { contactId: input.contactId, type: "PURCHASE", data: { orderId: order.id, amount: total, currency } },
      }),
    ]);

    await grantOrderResources(order.id).catch((err) =>
      console.error("[/api/checkout/capture] grantOrderResources", err),
    );

    // Delete Redis key — no longer needed
    await redis.del(`paypal:order:${paypalOrderId}`);

    const host = req.headers.get("host") ?? "localhost:3001";
    return ok({ nextStepUrl: input.funnelStepId ? await getNextStepUrl(input.funnelStepId, host) : null });
  } catch (error) {
    console.error("[/api/checkout/capture]", error);
    return fail(error instanceof Error ? error.message : "Internal error", 500);
  }
}
