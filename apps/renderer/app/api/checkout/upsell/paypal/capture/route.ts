import { NextRequest, NextResponse } from "next/server";
import { db, Prisma } from "@launchtic/database";
import { redis } from "../../../../../../lib/redis";
import { getPayPalProvider } from "../../../../../../lib/payments/registry";
import { getBranchUrl } from "../../../../../../lib/funnel-nav";
import { recordFunnelEvent, SID_HEADER } from "../../../../../../lib/funnel-events";
import { getAssignedVariantId } from "../../../../../../lib/ab-testing";
import { grantOrderResources } from "../../../../../../lib/resources";
import { fireTrigger } from "../../../../../../lib/automations";

function ok(data: Record<string, unknown>) { return NextResponse.json({ success: true, ...data }); }
function fail(error: string, status = 400) { return NextResponse.json({ success: false, error }, { status }); }

type Pending = {
  kind: "order" | "subscription";
  funnelStepId: string; pricePlanId: string; sid: string | null;
  contactId: string; workspaceId: string; currency: string; amount: number; name: string;
  interval?: string; trialDays?: number;
};

// POST /api/checkout/upsell/paypal/capture  { id }
// `id` = the PayPal order id (ONE_TIME) or subscription id (SUBSCRIPTION) the
// buyer approved. Captures/activates it, finalizes the sale, returns the
// accept-branch URL. Mirrors /api/checkout/{capture,activate} for the upsell.
export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return fail("id is required");

    const host = req.headers.get("host") ?? "localhost:3001";
    const sid = req.headers.get(SID_HEADER);

    const raw = await redis.get(`upsell:paypal:${id}`);
    if (!raw) return fail("Checkout session expired or not found.", 410);
    const p = JSON.parse(raw) as Pending;

    const step = await db.funnelStep.findUnique({
      where: { id: p.funnelStepId },
      select: { id: true, funnelId: true, acceptStepId: true, declineStepId: true },
    });
    if (!step) return fail("Funnel step not found", 404);
    const acceptUrl = await getBranchUrl(step, "accept", host);

    const provider = await getPayPalProvider(p.workspaceId);
    const contactSnapshot = await db.contact.findUnique({
      where: { id: p.contactId },
      select: { email: true, firstName: true, lastName: true },
    });

    let orderId: string;
    let amountCents: number;

    if (p.kind === "subscription") {
      // Idempotency: subscription already activated → don't re-create.
      const existingSub = await db.subscription.findFirst({
        where: { providerSubId: id },
        select: { id: true },
      });
      if (existingSub) return ok({ nextStepUrl: acceptUrl, alreadyProcessed: true });

      const { status, startTime, nextBillingTime } = await provider.getSubscription(id);
      if (!["ACTIVE", "APPROVED", "TRIALING"].includes(status)) {
        return fail(`PayPal subscription status: ${status}`, 402);
      }

      // Redis snapshot was written when the modal opened — re-read DB so a
      // merchant edit to trialDays during the 30-min window doesn't bake a
      // stale trial into the new sub. PayPal plan was already created with
      // the snapshot value (immutable), so we still use it as fallback.
      const livePlan = await db.stepPricePlan.findUnique({
        where: { id: p.pricePlanId },
        select: { trialDays: true },
      });
      const trialDays = livePlan?.trialDays ?? p.trialDays ?? 0;
      const trialEnd = trialDays > 0 ? new Date(Date.now() + trialDays * 86400_000) : null;
      const isTrial = !!trialEnd;

      const dbSub = await db.subscription.create({
        data: {
          workspaceId: p.workspaceId, contactId: p.contactId, funnelStepId: p.funnelStepId,
          stepPricePlanId: p.pricePlanId,
          status: isTrial ? "TRIALING" : "ACTIVE",
          paymentProvider: "paypal", providerSubId: id, trialEnd,
          currentPeriodStart: startTime ? new Date(startTime) : null,
          currentPeriodEnd: nextBillingTime ? new Date(nextBillingTime) : null,
          planSnapshot: { planName: p.name, amount: p.amount, finalAmount: p.amount, currency: p.currency, interval: p.interval ?? "month", trialDays: trialDays > 0 ? trialDays : null },
        },
      });
      const order = await db.order.create({
        data: {
          workspaceId: p.workspaceId, contactId: p.contactId, funnelStepId: p.funnelStepId,
          stepPricePlanId: p.pricePlanId, subscriptionId: dbSub.id,
          orderItemSnapshot: { planName: p.name, planType: "SUBSCRIPTION", unitPrice: p.amount },
          status: isTrial ? "TRIAL" : "PAID", paymentProvider: "paypal", paymentMethod: "paypal",
          providerOrderId: id, subtotal: p.amount, discountAmount: 0,
          total: isTrial ? 0 : p.amount, currency: p.currency,
          contactSnapshot: contactSnapshot ?? Prisma.JsonNull,
        },
        select: { id: true, total: true },
      });
      orderId = order.id;
      amountCents = order.total;
      if (!isTrial) {
        await db.transaction.create({
          data: { orderId: order.id, type: "SALE", amount: p.amount, currency: p.currency, reference: id, status: "COMPLETED" },
        });
      }
    } else {
      // ── ONE_TIME order capture ──
      const existing = await db.order.findFirst({
        where: { providerOrderId: id, status: "PAID" },
        select: { id: true },
      });
      if (existing) return ok({ nextStepUrl: acceptUrl, alreadyProcessed: true });

      const { status, captureId } = await provider.captureOrder(id);
      if (status !== "COMPLETED") return fail(`PayPal capture status: ${status}`, 402);

      const order = await db.order.create({
        data: {
          workspaceId: p.workspaceId, contactId: p.contactId, funnelStepId: p.funnelStepId,
          stepPricePlanId: p.pricePlanId,
          orderItemSnapshot: { planName: p.name, planType: "ONE_TIME", unitPrice: p.amount },
          status: "PAID", paymentProvider: "paypal", paymentMethod: "paypal",
          providerOrderId: id, subtotal: p.amount, discountAmount: 0, total: p.amount, currency: p.currency,
          contactSnapshot: contactSnapshot ?? Prisma.JsonNull,
        },
        select: { id: true, total: true },
      });
      await db.transaction.create({
        data: { orderId: order.id, type: "SALE", amount: p.amount, currency: p.currency, reference: captureId, status: "COMPLETED" },
      });
      orderId = order.id;
      amountCents = order.total;
    }

    // CRM + analytics + resources + automation (shared for both kinds).
    await db.contactEvent.create({
      data: { contactId: p.contactId, type: "PURCHASE", data: { orderId, amount: amountCents, currency: p.currency } },
    });
    await recordFunnelEvent({
      type: "PURCHASE", funnelId: step.funnelId, funnelStepId: p.funnelStepId,
      contactId: p.contactId, orderId, amountCents,
      sessionId: sid, variantId: await getAssignedVariantId(p.funnelStepId, sid),
    });
    await grantOrderResources(orderId).catch((e) => console.error("[upsell/paypal/capture] grantOrderResources", e));
    fireTrigger(p.workspaceId, "NEW_SALE", {
      contactId: p.contactId, orderId,
      orderTotal: amountCents / 100, orderCurrency: p.currency,
      funnelId: step.funnelId, funnelStepId: p.funnelStepId,
    }).catch(() => {});

    await redis.del(`upsell:paypal:${id}`);
    return ok({ nextStepUrl: acceptUrl });
  } catch (error) {
    console.error("[/api/checkout/upsell/paypal/capture]", error);
    return fail(error instanceof Error ? error.message : "Internal error", 500);
  }
}
