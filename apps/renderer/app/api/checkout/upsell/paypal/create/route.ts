import { NextRequest, NextResponse } from "next/server";
import { db } from "@launchtic/database";
import { redis } from "../../../../../../lib/redis";
import { getPayPalProvider } from "../../../../../../lib/payments/registry";
import { readPurchaseSession } from "../../../../../../lib/purchase-session";
import { SID_HEADER } from "../../../../../../lib/funnel-events";
import type { CheckoutInput, PricePlanRow } from "../../../../../../lib/payments/types";

function ok(data: Record<string, unknown>) { return NextResponse.json({ success: true, ...data }); }
function fail(error: string, status = 400) { return NextResponse.json({ success: false, error }, { status }); }

// POST /api/checkout/upsell/paypal/create  { funnelStepId, pricePlanId }
//
// "Pay again" modal for an UPSELL/DOWNSELL offer when one-click isn't possible
// (PayPal main purchase / no saved card). Creates a PayPal order (ONE_TIME) or
// PayPal subscription (SUBSCRIPTION); the client renders Smart Buttons against
// it and /capture finalizes it.
export async function POST(req: NextRequest) {
  try {
    const { funnelStepId, pricePlanId } = await req.json();
    if (!funnelStepId || !pricePlanId) return fail("funnelStepId and pricePlanId are required");

    const sid = req.headers.get(SID_HEADER);
    const session = await readPurchaseSession(sid);
    if (!session) return fail("Your session expired — please refresh and try again.", 410);

    const step = await db.funnelStep.findUnique({
      where: { id: funnelStepId },
      select: { id: true, type: true },
    });
    if (!step || (step.type !== "UPSELL" && step.type !== "DOWNSELL")) {
      return fail("Step is not an upsell or downsell", 400);
    }

    const plan = await db.stepPricePlan.findFirst({ where: { id: pricePlanId, funnelStepId } });
    if (!plan) return fail("Offer not found", 404);

    const provider = await getPayPalProvider(session.workspaceId);

    // ── ONE_TIME → bare PayPal order ──
    if (plan.type === "ONE_TIME") {
      const paypalOrderId = await provider.createUpsellOrder(plan.amount, plan.currency);
      await redis.setex(
        `upsell:paypal:${paypalOrderId}`,
        1800,
        JSON.stringify({
          kind: "order", funnelStepId, pricePlanId: plan.id, sid: sid ?? null,
          contactId: session.contactId, workspaceId: session.workspaceId,
          currency: plan.currency, amount: plan.amount, name: plan.name,
        }),
      );
      return ok({ kind: "order", paypalOrderId });
    }

    // ── SUBSCRIPTION → PayPal billing plan + subscription (reuse createCheckout) ──
    const contact = await db.contact.findUnique({
      where: { id: session.contactId },
      select: { email: true, firstName: true, lastName: true },
    });
    const input: CheckoutInput = {
      workspaceId: session.workspaceId,
      contactId: session.contactId,
      funnelStepId,
      pricePlanId: plan.id,
      physicalProductId: null,
      variantId: null,
      quantity: 1,
      couponCode: null,
      orderItemSnapshot: { planName: plan.name, planType: plan.type },
      discountAmount: 0,
      shippingFee: 0,
      bumpPlans: [],
      paymentMethodId: null,
      billingDetails: {
        name: [contact?.firstName, contact?.lastName].filter(Boolean).join(" "),
        email: contact?.email ?? "",
      },
    };
    const planRow: PricePlanRow = {
      id: plan.id, name: plan.name, type: "SUBSCRIPTION",
      amount: plan.amount, currency: plan.currency,
      interval: plan.interval, trialDays: plan.trialDays,
      stripePriceId: null, paypalPlanId: plan.paypalPlanId,
    };
    const result = await provider.createCheckout(input, planRow);
    if (result.type !== "paypal_subscription") {
      return fail("Failed to create PayPal subscription", 500);
    }
    const paypalSubscriptionId = result.paypalSubscriptionId;
    await redis.setex(
      `upsell:paypal:${paypalSubscriptionId}`,
      1800,
      JSON.stringify({
        kind: "subscription", funnelStepId, pricePlanId: plan.id, sid: sid ?? null,
        contactId: session.contactId, workspaceId: session.workspaceId,
        currency: plan.currency, amount: plan.amount, name: plan.name,
        interval: plan.interval ?? "month", trialDays: plan.trialDays ?? 0,
      }),
    );
    return ok({ kind: "subscription", paypalSubscriptionId });
  } catch (error) {
    console.error("[/api/checkout/upsell/paypal/create]", error);
    return fail(error instanceof Error ? error.message : "Internal error", 500);
  }
}
