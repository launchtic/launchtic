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

// Pending payload variants stored in Redis by /create. Discriminator drives
// the capture flow.
type PendingDigital = {
  kind: "order" | "subscription";
  funnelStepId: string; pricePlanId: string; sid: string | null;
  contactId: string; workspaceId: string;
  currency: string; amount: number; name: string;
  interval?: string; trialDays?: number;
  // Link back to the main step Order so dashboard/refund tree stays correct.
  mainOrderId?: string | null;
};

type PendingPhysical = {
  kind: "physical_order";
  funnelStepId: string; sid: string | null;
  contactId: string; workspaceId: string;
  currency: string; amount: number; name: string;
  physicalProductId: string;
  variantId: string | null;
  quantity: number;
  unitPrice: number;
  shippingFee: number;
  subtotal: number;
  shippingAddress: any;
  variantSnapshot: { id: string; name: string; combination: string[] } | null;
  mainOrderId: string | null;
  reservedStock: number;
};

type Pending = PendingDigital | PendingPhysical;

// POST /api/checkout/upsell/paypal/capture  { id }
//   `id` = PayPal order id (ONE_TIME / physical_order) or subscription id.
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

    // ─────────────────────────────────────────────────────────────────────
    // PHYSICAL — capture PayPal order, create Order with shippingAddress +
    // variant snapshot + parentOrderId. Stock was reserved at /create.
    // ─────────────────────────────────────────────────────────────────────
    if (p.kind === "physical_order") {
      const existing = await db.order.findFirst({
        where: { providerOrderId: id, status: "PAID" },
        select: { id: true },
      });
      if (existing) {
        await redis.del(`upsell:paypal:${id}`);
        return ok({ nextStepUrl: acceptUrl, alreadyProcessed: true });
      }

      let captureRef: { status: string; captureId: string | null };
      try {
        captureRef = await provider.captureOrder(id);
      } catch (err) {
        // Capture failed before money moved → release stock reservation.
        if (p.reservedStock > 0) {
          db.physicalProduct.update({
            where: { id: p.physicalProductId },
            data:  { stockLimit: { increment: p.reservedStock } },
          }).catch((e) => console.error("[upsell/paypal/capture] physical stock rollback failed", e));
        }
        await redis.del(`upsell:paypal:${id}`);
        throw err;
      }
      if (captureRef.status !== "COMPLETED") {
        if (p.reservedStock > 0) {
          db.physicalProduct.update({
            where: { id: p.physicalProductId },
            data:  { stockLimit: { increment: p.reservedStock } },
          }).catch(() => {});
        }
        await redis.del(`upsell:paypal:${id}`);
        return fail(`PayPal capture status: ${captureRef.status}`, 402);
      }

      try {
        const order = await db.order.create({
          data: {
            workspaceId: p.workspaceId, contactId: p.contactId, funnelStepId: p.funnelStepId,
            parentOrderId: p.mainOrderId ?? null,
            physicalProductId: p.physicalProductId, variantId: p.variantId,
            quantity: p.quantity,
            orderItemSnapshot: {
              productName: p.name, unitPrice: p.unitPrice, quantity: p.quantity,
              variant: p.variantSnapshot,
            },
            status: "PAID", paymentProvider: "paypal", paymentMethod: "paypal",
            providerOrderId: id,
            subtotal: p.subtotal, discountAmount: 0, shippingFee: p.shippingFee,
            total: p.amount, currency: p.currency,
            shippingAddress: p.shippingAddress as Prisma.InputJsonValue,
            contactSnapshot: contactSnapshot ?? Prisma.JsonNull,
          },
          select: { id: true, total: true },
        });
        await db.transaction.create({
          data: { orderId: order.id, type: "SALE", amount: p.amount, currency: p.currency, reference: captureRef.captureId ?? id, status: "COMPLETED" },
        });
        orderId     = order.id;
        amountCents = order.total;
      } catch (err) {
        // Money already moved — keep stock decremented, log for reconciliation.
        console.error(
          "[upsell/paypal/capture] PHYSICAL BOOKKEEPING_FAILED_AFTER_CAPTURE — manual reconciliation required",
          { paypalOrderId: id, p, error: (err as any)?.message ?? err },
        );
        await redis.del(`upsell:paypal:${id}`);
        return ok({ nextStepUrl: acceptUrl, reconciliationPending: true });
      }
    } else if (p.kind === "subscription") {
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

      // Re-read DB so a merchant edit during the 30-min window doesn't bake
      // a stale trial into the new sub.
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
          parentOrderId: p.mainOrderId ?? null,
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
      // ── ONE_TIME digital order capture ──
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
          parentOrderId: p.mainOrderId ?? null,
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

    // CRM + analytics + resources + automation (shared across kinds).
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
