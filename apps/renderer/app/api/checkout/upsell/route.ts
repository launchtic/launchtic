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

// PhysicalProduct.variants is stored as JSON — typed here so we can resolve
// the visitor's selected variant + price.
type ProductVariant = {
  id: string; name: string; combination: string[];
  sku: string | null; price: number | null; image: string | null;
};

// POST /api/checkout/upsell
//
// One-click (off-session) purchase of an UPSELL/DOWNSELL offer using the card
// saved on the main checkout. Branches by request body shape:
//   digital  → { funnelStepId, pricePlanId }
//   physical → { funnelStepId, physicalProductId, variantId, quantity }
//
// Returns:
//   { nextStepUrl }                 — charged, go to the accept branch
//   { requiresPayment, declineUrl } — no saved card / off-session failed →
//                                     the front-end shows a payment modal
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const funnelStepId: string | undefined = body?.funnelStepId;
    if (!funnelStepId) return fail("funnelStepId is required");

    const sid  = req.headers.get(SID_HEADER);
    const host = req.headers.get("host") ?? "localhost:3001";

    // ─────────────────────────────────────────────────────────────────────
    // PHYSICAL upsell branch
    // ─────────────────────────────────────────────────────────────────────
    if (body.physicalProductId) {
      const physicalProductId: string = body.physicalProductId;
      const variantId: string | null  = body.variantId ?? null;
      const quantity: number = Math.max(1, Number.isFinite(Number(body.quantity)) ? Math.floor(Number(body.quantity)) : 1);

      // Optional inline-collected address when the main checkout was digital-only
      // (parent Order has no shippingAddress to reuse). Front-end pops the modal
      // after we respond with `requiresShipping: true`, then re-POSTs with this.
      const inlineShipToRaw = body.inlineShipTo;
      const inlineShipTo: {
        name: string; line1: string; line2?: string; city: string;
        state?: string; postalCode: string; country: string;
      } | null = (
        inlineShipToRaw
          && typeof inlineShipToRaw === "object"
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

      const step = await db.funnelStep.findUnique({
        where: { id: funnelStepId },
        select: {
          id: true, funnelId: true, type: true, offerType: true,
          physicalProductId: true, shippingFee: true,
          acceptStepId: true, declineStepId: true,
          funnel: { select: { currency: true } },
        },
      });
      if (!step) return fail("Funnel step not found", 404);
      if (step.type !== "UPSELL" && step.type !== "DOWNSELL") {
        return fail("Step is not an upsell or downsell", 400);
      }
      if (step.offerType !== "PHYSICAL" || !step.physicalProductId) {
        return fail("Step is not configured for a physical offer", 400);
      }
      if (step.physicalProductId !== physicalProductId) {
        return fail("Offer mismatch — refresh the page and try again", 400);
      }

      const acceptUrl  = await getBranchUrl(step, "accept", host);
      const declineUrl = await getBranchUrl(step, "decline", host);

      const session = await readPurchaseSession(sid);
      console.log("[upsell/physical] incoming", { sid, funnelStepId, physicalProductId, variantId, quantity, hasInlineShipTo: !!inlineShipTo, sessionProvider: session?.provider, mainOrderId: session?.mainOrderId });
      // Direct access / expired — can't charge silently → route to decline.
      if (!session) {
        console.log("[upsell/physical] no purchase session → decline");
        return ok({ requiresPayment: false, declineUrl });
      }

      // Shipping address resolution runs BEFORE the provider gate. Otherwise
      // a PayPal-main buyer would be routed to the PayPal "pay again" modal
      // first, which then calls /paypal/create with no address and throws
      // "Failed to start PayPal". This ordering ensures the address modal
      // always opens first when needed — and by the time PayPal fallback
      // fires, OfferButton already has `inlineShipTo` in state to forward.
      if (!session.mainOrderId) {
        console.log("[upsell/physical] session has no mainOrderId → decline");
        return ok({ requiresPayment: false, declineUrl, error: "missing_main_order" });
      }
      const mainOrder = await db.order.findUnique({
        where: { id: session.mainOrderId },
        select: { shippingAddress: true, currency: true },
      });
      if (!mainOrder) {
        console.log("[upsell/physical] mainOrder not found → decline", { mainOrderId: session.mainOrderId });
        return ok({ requiresPayment: false, declineUrl, error: "missing_main_order" });
      }
      const shippingAddress: Prisma.InputJsonValue | null = inlineShipTo
        ? (inlineShipTo as unknown as Prisma.InputJsonValue)
        : (mainOrder.shippingAddress as Prisma.InputJsonValue | null);
      if (!shippingAddress) {
        // canUseStripe tells the client whether to show the "Confirm with card"
        // button (Stripe one-click). Only true when the main checkout went
        // through Stripe — otherwise there's no saved card to charge.
        // canUsePayPal is decided client-side from `upsell.paypalClientId`.
        const canUseStripe = session.provider === "stripe";
        console.log("[upsell/physical] no shipping address → requiresShipping", { hasMainAddress: !!mainOrder.shippingAddress, hasInline: !!inlineShipTo, canUseStripe });
        return ok({ requiresShipping: true, canUseStripe, declineUrl });
      }

      // Provider gate — needs Stripe for one-click off-session. If main was
      // PayPal/free, the PayPal "pay again" modal handles the rest (now safely,
      // because shipping is already in hand via inlineShipTo or mainOrder).
      if (session.provider !== "stripe") {
        console.log("[upsell/physical] non-stripe session → PayPal modal", { provider: session.provider });
        return ok({ requiresPayment: true, declineUrl });
      }

      const currency = (step.funnel.currency || mainOrder.currency).toLowerCase();
      if (session.currency.toLowerCase() !== currency) {
        return ok({ requiresPayment: true, declineUrl });
      }

      const product = await db.physicalProduct.findUnique({
        where: { id: physicalProductId },
        select: {
          id: true, name: true, price: true, currency: true, variants: true,
          limitStock: true, stockLimit: true,
        },
      });
      if (!product) return fail("Product not found", 404);

      // Resolve unit price from variant override (if any), otherwise the
      // product's reference price.
      let unitPrice = product.price;
      let variantSnapshot: { id: string; name: string; combination: string[] } | null = null;
      if (variantId) {
        const variants = (product.variants ?? []) as ProductVariant[];
        const v = variants.find((x) => x.id === variantId);
        if (!v) return fail("Variant not found", 400);
        if (v.price != null) unitPrice = v.price;
        variantSnapshot = { id: v.id, name: v.name, combination: v.combination };
      }

      // Atomic stock reservation. The single UPDATE with `gte` guard runs as
      // one SQL statement, so concurrent buyers can't both win against the
      // last unit in stock. If the conditional update touches 0 rows → sold
      // out. Charge-failure path further down releases the reservation.
      let reservedStock = 0;
      if (product.limitStock) {
        const reserved = await db.physicalProduct.updateMany({
          where: { id: physicalProductId, stockLimit: { gte: quantity } },
          data:  { stockLimit: { decrement: quantity } },
        });
        if (reserved.count === 0) {
          return ok({ requiresPayment: false, declineUrl, error: "out_of_stock" });
        }
        reservedStock = quantity;
      }

      const shippingFee = step.shippingFee ?? 0;
      const subtotal    = unitPrice * quantity;
      const total       = subtotal + shippingFee;

      const provider        = await getStripeProvider(session.workspaceId);
      const customerId      = await provider.getCustomerId(session.contactId, currency);
      const paymentMethodId = await provider.getSavedCardPaymentMethod(customerId);
      if (!paymentMethodId) return ok({ requiresPayment: true, declineUrl });

      // Idempotency: at most one upsell charge per (session, step). Same
      // semantics as the digital branch — see comments below.
      const lockKey = `upsell:lock:${sid}:${funnelStepId}`;
      let locked: string | null;
      try {
        locked = await redis.set(lockKey, "1", "EX", 7200, "NX");
      } catch (e) {
        console.error("[/api/checkout/upsell] physical lock failed (Redis down) — fallback to modal", e);
        return ok({ requiresPayment: true, declineUrl, error: "lock_unavailable" });
      }
      if (locked === null) return ok({ nextStepUrl: acceptUrl, alreadyProcessed: true });

      const contactSnapshot = await db.contact.findUnique({
        where: { id: session.contactId },
        select: { email: true, firstName: true, lastName: true },
      });
      const idempotencyKey = `upsell:${sid}:${funnelStepId}`;

      let chargeRef: { provider: "stripe"; id: string; kind: "payment" } | null = null;
      try {
        const charge = await provider.chargeSavedPaymentMethod({
          customerId, paymentMethodId,
          amount: total, currency,
          workspaceId: session.workspaceId,
          idempotencyKey,
          metadata: { funnelStepId, kind: "upsell", physicalProductId, variantId: variantId ?? "" },
        });
        if (charge.status !== "succeeded") throw new Error(`charge status: ${charge.status}`);
        chargeRef = { provider: "stripe", id: charge.paymentIntentId, kind: "payment" };

        const order = await db.order.create({
          data: {
            workspaceId: session.workspaceId, contactId: session.contactId, funnelStepId,
            parentOrderId: session.mainOrderId,
            physicalProductId, variantId,
            quantity,
            orderItemSnapshot: {
              productName: product.name, unitPrice, quantity,
              variant: variantSnapshot,
            },
            status: "PAID", paymentProvider: "stripe", paymentMethod: "card",
            paymentMethodId, providerOrderId: charge.paymentIntentId,
            subtotal, discountAmount: 0, shippingFee, total, currency,
            shippingAddress,
            contactSnapshot: contactSnapshot ?? Prisma.JsonNull,
          },
          select: { id: true, total: true },
        });
        await db.transaction.create({
          data: { orderId: order.id, type: "SALE", amount: total, currency, reference: charge.chargeId, status: "COMPLETED" },
        });

        // Stock already decremented atomically before the charge — no
        // post-charge update needed here.

        await db.contactEvent.create({
          data: { contactId: session.contactId, type: "PURCHASE", data: { orderId: order.id, amount: total, currency } },
        });
        await recordFunnelEvent({
          type: "PURCHASE", funnelId: step.funnelId, funnelStepId,
          contactId: session.contactId, orderId: order.id, amountCents: total,
          sessionId: sid, variantId: await getAssignedVariantId(funnelStepId, sid),
        });
        await grantOrderResources(order.id).catch((e) => console.error("[/api/checkout/upsell] grantOrderResources", e));
        fireTrigger(session.workspaceId, "NEW_SALE", {
          contactId: session.contactId, orderId: order.id,
          orderTotal: total / 100, orderCurrency: currency,
          funnelId: step.funnelId, funnelStepId,
        }).catch(() => {});

        return ok({ nextStepUrl: acceptUrl });
      } catch (err: any) {
        if (chargeRef) {
          // Gateway moved money — bookkeeping after failed. Keep the lock,
          // log for reconciliation, route the buyer forward.
          console.error(
            "[/api/checkout/upsell] PHYSICAL BOOKKEEPING_FAILED_AFTER_CHARGE — manual reconciliation required",
            { chargeRef, sid, funnelStepId, physicalProductId, variantId, quantity, error: err?.message ?? err },
          );
          return ok({ nextStepUrl: acceptUrl, reconciliationPending: true });
        }
        // Off-session charge failed → release lock + stock reservation, then
        // let the front-end show the PayPal "pay again" modal.
        if (reservedStock > 0) {
          db.physicalProduct.update({
            where: { id: physicalProductId },
            data:  { stockLimit: { increment: reservedStock } },
          }).catch((e) => console.error("[/api/checkout/upsell] stock rollback failed", e));
        }
        await redis.del(lockKey).catch(() => {});
        console.error("[/api/checkout/upsell] physical off-session charge failed:", err?.message ?? err);
        return ok({ requiresPayment: true, declineUrl, error: "off_session_failed" });
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // DIGITAL upsell branch (existing behavior, unchanged)
    // ─────────────────────────────────────────────────────────────────────
    const pricePlanId: string | undefined = body?.pricePlanId;
    if (!pricePlanId) return fail("pricePlanId or physicalProductId is required");

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

    // No purchase session = direct access / expired (e.g. a guest landed on the
    // upsell page without buying). We don't know the buyer, so neither one-click
    // nor the PayPal "pay again" modal can work — just route to the decline
    // branch. `requiresPayment: false` tells the button NOT to open the modal.
    if (!session) return ok({ requiresPayment: false, declineUrl });

    // Session exists but one-click isn't possible (PayPal main purchase, or
    // currency mismatch with the Stripe customer). The PayPal pay-again modal
    // CAN work here (the contact is known), so signal requiresPayment.
    if (session.provider !== "stripe"
        || session.currency.toLowerCase() !== plan.currency.toLowerCase()) {
      return ok({ requiresPayment: true, declineUrl });
    }

    const provider = await getStripeProvider(session.workspaceId);
    const customerId = await provider.getCustomerId(session.contactId, plan.currency);
    const paymentMethodId = await provider.getSavedCardPaymentMethod(customerId);
    if (!paymentMethodId) return ok({ requiresPayment: true, declineUrl });

    // Idempotency: at most one upsell charge per (session, step). Lock first so
    // a double-click / reload doesn't double-charge. Fail-CLOSED if Redis is
    // down — better to fall back to the PayPal modal than risk a double-charge.
    const lockKey = `upsell:lock:${sid}:${funnelStepId}`;
    let locked: string | null;
    try {
      locked = await redis.set(lockKey, "1", "EX", 7200, "NX");
    } catch (e) {
      console.error("[/api/checkout/upsell] lock failed (Redis down) — falling back to modal", e);
      return ok({ requiresPayment: true, declineUrl, error: "lock_unavailable" });
    }
    if (locked === null) return ok({ nextStepUrl: acceptUrl, alreadyProcessed: true });

    const contactSnapshot = await db.contact.findUnique({
      where: { id: session.contactId },
      select: { email: true, firstName: true, lastName: true },
    });
    const idempotencyKey = `upsell:${sid}:${funnelStepId}`;

    // chargeRef set the instant the gateway confirms money moved. If anything
    // after this point throws, the customer is ALREADY charged — releasing the
    // lock would let PayPal fallback double-bill. Keep the lock + log for
    // admin reconciliation instead.
    let chargeRef: { provider: "stripe"; id: string; kind: "payment" | "subscription" } | null = null;

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
        chargeRef = { provider: "stripe", id: charge.paymentIntentId, kind: "payment" };

        order = await db.order.create({
          data: {
            workspaceId: session.workspaceId, contactId: session.contactId, funnelStepId,
            stepPricePlanId: plan.id,
            parentOrderId: session.mainOrderId ?? null,
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
        chargeRef = { provider: "stripe", id: sub.subscriptionId, kind: "subscription" };
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
            parentOrderId: session.mainOrderId ?? null,
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
      if (chargeRef) {
        // The gateway already moved money — DB bookkeeping (order/subscription/
        // events/resources) failed afterwards. Releasing the lock would let
        // PayPal fallback re-charge. KEEP the lock, surface for admin reconciliation,
        // and route the user forward as if accepted (charge succeeded).
        console.error(
          "[/api/checkout/upsell] BOOKKEEPING_FAILED_AFTER_CHARGE — manual reconciliation required",
          { chargeRef, sid, funnelStepId, planId: plan.id, error: err?.message ?? err },
        );
        return ok({ nextStepUrl: acceptUrl, reconciliationPending: true });
      }
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
