import { NextRequest, NextResponse } from "next/server";
import { db, Prisma } from "@launchtic/database";
import { redis } from "../../../../lib/redis";
import { getStripeProvider } from "../../../../lib/payments/registry";
import { readPurchaseSession } from "../../../../lib/purchase-session";
import { getBranchUrl } from "../../../../lib/funnel-nav";
import { recordFunnelEvent, SID_HEADER } from "../../../../lib/funnel-events";
import { getAssignedVariantId } from "../../../../lib/ab-testing";
import { grantOrderResources } from "../../../../lib/resources";
import { fireTrigger } from "../../../../lib/automations";

function ok(data: Record<string, unknown>) { return NextResponse.json({ success: true, ...data }); }
function fail(error: string, status = 400) { return NextResponse.json({ success: false, error }, { status }); }

// POST /api/checkout/upsell  { funnelStepId, pricePlanId }
//
// One-click (off-session) purchase of an UPSELL/DOWNSELL offer using the card
// the visitor saved on the main checkout. Returns:
//   { nextStepUrl }                 — charged, go to the accept branch
//   { requiresPayment, declineUrl } — no saved card / off-session failed →
//                                     the front-end shows a payment modal
export async function POST(req: NextRequest) {
  try {
    const { funnelStepId, pricePlanId } = await req.json();
    if (!funnelStepId || !pricePlanId) return fail("funnelStepId and pricePlanId are required");

    const sid = req.headers.get(SID_HEADER);
    const host = req.headers.get("host") ?? "localhost:3001";

    const step = await db.funnelStep.findUnique({
      where: { id: funnelStepId },
      select: { id: true, funnelId: true, type: true, acceptStepId: true, declineStepId: true },
    });
    if (!step) return fail("Funnel step not found", 404);
    if (step.type !== "UPSELL" && step.type !== "DOWNSELL") {
      return fail("Step is not an upsell or downsell", 400);
    }

    const acceptUrl  = await getBranchUrl(step, "accept", host);
    const declineUrl = await getBranchUrl(step, "decline", host);

    // The offer must belong to this step.
    const plan = await db.stepPricePlan.findFirst({ where: { id: pricePlanId, funnelStepId } });
    if (!plan) return fail("Offer not found", 404);

    // Who just bought? (linked to lt_sid at the main checkout)
    const session = await readPurchaseSession(sid);
    // One-click is possible only when the main purchase was via Stripe (saved
    // card) and the currency matches the customer's pinned currency.
    if (!session || session.provider !== "stripe"
        || session.currency.toLowerCase() !== plan.currency.toLowerCase()) {
      return ok({ requiresPayment: true, declineUrl });
    }

    const provider = await getStripeProvider(session.workspaceId);
    const customerId = await provider.getCustomerId(session.contactId, plan.currency);
    const paymentMethodId = await provider.getSavedCardPaymentMethod(customerId);
    if (!paymentMethodId) return ok({ requiresPayment: true, declineUrl });

    // Idempotency: at most one upsell charge per (session, step). Lock first so a
    // double-click / reload doesn't double-charge. Fail-open if Redis is down.
    const lockKey = `upsell:lock:${sid}:${funnelStepId}`;
    const locked = await redis.set(lockKey, "1", "EX", 7200, "NX").catch(() => "OK" as const);
    if (locked === null) return ok({ nextStepUrl: acceptUrl, alreadyProcessed: true });

    const contactSnapshot = await db.contact.findUnique({
      where: { id: session.contactId },
      select: { email: true, firstName: true, lastName: true },
    });
    const idempotencyKey = `upsell:${sid}:${funnelStepId}`;

    try {
      let order: { id: string; total: number };

      if (plan.type === "ONE_TIME") {
        const charge = await provider.chargeSavedPaymentMethod({
          customerId, paymentMethodId,
          amount: plan.amount, currency: plan.currency,
          workspaceId: session.workspaceId,
          idempotencyKey,
          metadata: { funnelStepId, kind: "upsell" },
        });
        if (charge.status !== "succeeded") throw new Error(`charge status: ${charge.status}`);

        order = await db.order.create({
          data: {
            workspaceId: session.workspaceId, contactId: session.contactId, funnelStepId,
            stepPricePlanId: plan.id,
            orderItemSnapshot: { planName: plan.name, planType: plan.type, unitPrice: plan.amount },
            status: "PAID", paymentProvider: "stripe", paymentMethod: "card",
            paymentMethodId, providerOrderId: charge.paymentIntentId,
            subtotal: plan.amount, discountAmount: 0, total: plan.amount, currency: plan.currency,
            contactSnapshot: contactSnapshot ?? Prisma.JsonNull,
          },
          select: { id: true, total: true },
        });
        await db.transaction.create({
          data: { orderId: order.id, type: "SALE", amount: plan.amount, currency: plan.currency, reference: charge.chargeId, status: "COMPLETED" },
        });
      } else {
        // SUBSCRIPTION (trial when trialDays > 0)
        const sub = await provider.createOffSessionSubscription({
          customerId, paymentMethodId,
          plan: { id: plan.id, name: plan.name, type: "SUBSCRIPTION", amount: plan.amount, currency: plan.currency, interval: plan.interval, trialDays: plan.trialDays, stripePriceId: plan.stripePriceId },
          workspaceId: session.workspaceId,
          idempotencyKey,
        });
        const isTrial = !!sub.trialEnd;
        const dbSub = await db.subscription.create({
          data: {
            workspaceId: session.workspaceId, contactId: session.contactId, funnelStepId,
            stepPricePlanId: plan.id,
            status: isTrial ? "TRIALING" : "ACTIVE",
            paymentProvider: "stripe", providerSubId: sub.subscriptionId,
            trialEnd: sub.trialEnd ? new Date(sub.trialEnd * 1000) : null,
            currentPeriodStart: sub.currentPeriodStart ? new Date(sub.currentPeriodStart * 1000) : null,
            currentPeriodEnd: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd * 1000) : null,
            planSnapshot: { planName: plan.name, amount: plan.amount, finalAmount: plan.amount, currency: plan.currency, interval: plan.interval ?? "month", trialDays: plan.trialDays ?? null },
          },
        });
        order = await db.order.create({
          data: {
            workspaceId: session.workspaceId, contactId: session.contactId, funnelStepId,
            stepPricePlanId: plan.id, subscriptionId: dbSub.id,
            orderItemSnapshot: { planName: plan.name, planType: plan.type, unitPrice: plan.amount },
            status: isTrial ? "TRIAL" : "PAID", paymentProvider: "stripe", paymentMethod: "card",
            paymentMethodId, providerOrderId: sub.subscriptionId, invoiceId: sub.invoiceId,
            subtotal: plan.amount, discountAmount: 0, total: isTrial ? 0 : plan.amount, currency: plan.currency,
            contactSnapshot: contactSnapshot ?? Prisma.JsonNull,
          },
          select: { id: true, total: true },
        });
        if (!isTrial) {
          await db.transaction.create({
            data: { orderId: order.id, type: "SALE", amount: plan.amount, currency: plan.currency, reference: sub.subscriptionId, status: "COMPLETED" },
          });
        }
      }

      // CRM + analytics + resources + automation — mirror checkout/confirm.
      const amountCents = order.total;
      await db.contactEvent.create({
        data: { contactId: session.contactId, type: "PURCHASE", data: { orderId: order.id, amount: amountCents, currency: plan.currency } },
      });
      await recordFunnelEvent({
        type: "PURCHASE", funnelId: step.funnelId, funnelStepId,
        contactId: session.contactId, orderId: order.id, amountCents,
        sessionId: sid, variantId: await getAssignedVariantId(funnelStepId, sid),
      });
      await grantOrderResources(order.id).catch((e) => console.error("[/api/checkout/upsell] grantOrderResources", e));
      fireTrigger(session.workspaceId, "NEW_SALE", {
        contactId: session.contactId, orderId: order.id,
        orderTotal: amountCents / 100, orderCurrency: plan.currency,
        funnelId: step.funnelId, funnelStepId,
      }).catch(() => {});

      return ok({ nextStepUrl: acceptUrl });
    } catch (err: any) {
      // Off-session charge failed (authentication_required / card_declined) —
      // release the lock and let the front-end show an interactive modal.
      await redis.del(lockKey).catch(() => {});
      console.error("[/api/checkout/upsell] off-session charge failed:", err?.message ?? err);
      return ok({ requiresPayment: true, declineUrl, error: "off_session_failed" });
    }
  } catch (error) {
    console.error("[/api/checkout/upsell]", error);
    return fail(error instanceof Error ? error.message : "Internal error", 500);
  }
}
