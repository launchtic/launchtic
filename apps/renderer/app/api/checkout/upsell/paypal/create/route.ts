import { NextRequest, NextResponse } from "next/server";
import { db } from "@launchtic/database";
import { redis } from "../../../../../../lib/redis";
import { getPayPalProvider } from "../../../../../../lib/payments/registry";
import { readPurchaseSession } from "../../../../../../lib/purchase-session";
import { SID_HEADER } from "../../../../../../lib/funnel-events";
import type { CheckoutInput, PricePlanRow } from "../../../../../../lib/payments/types";

function ok(data: Record<string, unknown>) { return NextResponse.json({ success: true, ...data }); }
function fail(error: string, status = 400) { return NextResponse.json({ success: false, error }, { status }); }

type ProductVariant = {
  id: string; name: string; combination: string[];
  sku: string | null; price: number | null; image: string | null;
};

// POST /api/checkout/upsell/paypal/create
//
// "Pay again" modal for an UPSELL/DOWNSELL offer when one-click isn't possible.
// Body shape branches:
//   digital  → { funnelStepId, pricePlanId }
//   physical → { funnelStepId, physicalProductId, variantId, quantity, inlineShipTo? }
//
// Creates a PayPal order/subscription (digital) OR a PayPal order for the
// item + shipping total (physical). Client renders Smart Buttons, then
// /capture finalizes. PayPal physical is ONE_TIME only — recurring physical
// upsells aren't a thing.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const funnelStepId: string | undefined = body?.funnelStepId;
    if (!funnelStepId) return fail("funnelStepId is required");

    const sid = req.headers.get(SID_HEADER);
    const session = await readPurchaseSession(sid);
    if (!session) return fail("Your session expired — please refresh and try again.", 410);

    const step = await db.funnelStep.findUnique({
      where: { id: funnelStepId },
      select: {
        id: true, type: true, offerType: true,
        physicalProductId: true, shippingFee: true,
        funnel: { select: { currency: true } },
      },
    });
    if (!step || (step.type !== "UPSELL" && step.type !== "DOWNSELL")) {
      return fail("Step is not an upsell or downsell", 400);
    }

    const provider = await getPayPalProvider(session.workspaceId);

    // ─────────────────────────────────────────────────────────────────────
    // PHYSICAL branch — bare PayPal order for (item + shipping). One-time only.
    // ─────────────────────────────────────────────────────────────────────
    if (body.physicalProductId) {
      const physicalProductId: string = body.physicalProductId;
      const variantId: string | null  = body.variantId ?? null;
      const quantity: number = Math.max(1, Number.isFinite(Number(body.quantity)) ? Math.floor(Number(body.quantity)) : 1);
      console.log("[paypal/create/physical] incoming", { sid, funnelStepId, physicalProductId, variantId, quantity, hasInlineShipTo: !!body.inlineShipTo });

      // Inline-collected address when main Order has none. Same shape + validation
      // as the Stripe upsell route — keep them in sync.
      const inlineShipToRaw = body.inlineShipTo;
      const inlineShipTo: {
        name: string; line1: string; line2?: string; city: string;
        state?: string; postalCode: string; country: string;
      } | null = (
        inlineShipToRaw && typeof inlineShipToRaw === "object"
        && typeof inlineShipToRaw.name === "string"        && inlineShipToRaw.name.trim()
        && typeof inlineShipToRaw.line1 === "string"       && inlineShipToRaw.line1.trim()
        && typeof inlineShipToRaw.city === "string"        && inlineShipToRaw.city.trim()
        && typeof inlineShipToRaw.postalCode === "string"  && inlineShipToRaw.postalCode.trim()
        && typeof inlineShipToRaw.country === "string"     && inlineShipToRaw.country.trim()
      ) ? {
        name:       inlineShipToRaw.name.trim(),
        line1:      inlineShipToRaw.line1.trim(),
        line2:      typeof inlineShipToRaw.line2 === "string" && inlineShipToRaw.line2.trim() ? inlineShipToRaw.line2.trim() : undefined,
        city:       inlineShipToRaw.city.trim(),
        state:      typeof inlineShipToRaw.state === "string" && inlineShipToRaw.state.trim() ? inlineShipToRaw.state.trim() : undefined,
        postalCode: inlineShipToRaw.postalCode.trim(),
        country:    inlineShipToRaw.country.trim().toUpperCase(),
      } : null;

      if (step.offerType !== "PHYSICAL" || !step.physicalProductId) {
        console.log("[paypal/create/physical] step not configured for physical", { offerType: step.offerType, physicalProductId: step.physicalProductId });
        return fail("Step is not configured for a physical offer", 400);
      }
      if (step.physicalProductId !== physicalProductId) {
        console.log("[paypal/create/physical] offer mismatch", { stepProductId: step.physicalProductId, bodyProductId: physicalProductId });
        return fail("Offer mismatch — refresh the page and try again", 400);
      }
      if (!session.mainOrderId) {
        console.log("[paypal/create/physical] session has no mainOrderId");
        return fail("missing_main_order", 400);
      }

      const mainOrder = await db.order.findUnique({
        where: { id: session.mainOrderId },
        select: { shippingAddress: true, currency: true },
      });
      if (!mainOrder) {
        console.log("[paypal/create/physical] mainOrder not found", { mainOrderId: session.mainOrderId });
        return fail("missing_main_order", 400);
      }

      const shippingAddress = inlineShipTo ?? (mainOrder.shippingAddress as any);
      if (!shippingAddress) {
        // After the upsell route fix this shouldn't happen — that route now
        // checks shipping before the provider gate, so OfferButton collects
        // the address before falling back to PayPal. Keep a clear error in
        // case some flow slips past.
        console.error("[paypal/create/physical] no shipping address — upsell flow shouldn't have reached PayPal create without one");
        return fail("Shipping address required for this offer", 400);
      }

      const product = await db.physicalProduct.findUnique({
        where: { id: physicalProductId },
        select: {
          id: true, name: true, price: true, currency: true,
          variants: true, limitStock: true, stockLimit: true,
        },
      });
      if (!product) return fail("Product not found", 404);

      let unitPrice = product.price;
      let variantSnapshot: { id: string; name: string; combination: string[] } | null = null;
      if (variantId) {
        const variants = (product.variants ?? []) as ProductVariant[];
        const v = variants.find((x) => x.id === variantId);
        if (!v) return fail("Variant not found", 400);
        if (v.price != null) unitPrice = v.price;
        variantSnapshot = { id: v.id, name: v.name, combination: v.combination };
      }

      // Atomic stock reservation — same pattern as the Stripe upsell route.
      // Rollback happens in /capture if the buyer abandons mid-flow (Redis
      // key TTL expires) OR if capture fails.
      let reservedStock = 0;
      if (product.limitStock) {
        const reserved = await db.physicalProduct.updateMany({
          where: { id: physicalProductId, stockLimit: { gte: quantity } },
          data:  { stockLimit: { decrement: quantity } },
        });
        if (reserved.count === 0) return ok({ outOfStock: true });
        reservedStock = quantity;
      }

      const currency    = (step.funnel.currency || mainOrder.currency).toLowerCase();
      const shippingFee = step.shippingFee ?? 0;
      const subtotal    = unitPrice * quantity;
      const total       = subtotal + shippingFee;

      try {
        const paypalOrderId = await provider.createUpsellOrder(total, currency);
        await redis.setex(
          `upsell:paypal:${paypalOrderId}`,
          1800,
          JSON.stringify({
            kind: "physical_order",
            funnelStepId, sid: sid ?? null,
            contactId: session.contactId, workspaceId: session.workspaceId,
            currency, amount: total, name: product.name,
            physicalProductId, variantId, quantity, unitPrice,
            shippingFee, subtotal,
            shippingAddress, variantSnapshot,
            mainOrderId: session.mainOrderId ?? null,
            reservedStock,
          }),
        );
        return ok({ kind: "order", paypalOrderId });
      } catch (err) {
        // PayPal order creation failed before money moved — release the stock.
        if (reservedStock > 0) {
          db.physicalProduct.update({
            where: { id: physicalProductId },
            data:  { stockLimit: { increment: reservedStock } },
          }).catch((e) => console.error("[upsell/paypal/create] physical stock rollback failed", e));
        }
        throw err;
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // DIGITAL branch (existing behavior)
    // ─────────────────────────────────────────────────────────────────────
    const pricePlanId: string | undefined = body?.pricePlanId;
    if (!pricePlanId) return fail("pricePlanId or physicalProductId is required");

    const plan = await db.stepPricePlan.findFirst({ where: { id: pricePlanId, funnelStepId } });
    if (!plan) return fail("Offer not found", 404);

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
          mainOrderId: session.mainOrderId ?? null,
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
        mainOrderId: session.mainOrderId ?? null,
      }),
    );
    return ok({ kind: "subscription", paypalSubscriptionId });
  } catch (error) {
    console.error("[/api/checkout/upsell/paypal/create]", error);
    return fail(error instanceof Error ? error.message : "Internal error", 500);
  }
}
