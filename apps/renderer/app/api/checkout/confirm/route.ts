import { NextRequest, NextResponse } from "next/server";
import { db } from "@launchtic/database";
import { fireTrigger } from "../../../../lib/automations";
import { setLtContactCookie } from "../../../../lib/identity-cookie";
import { grantOrderResources } from "../../../../lib/resources";
import { recordCouponUsage } from "../../../../lib/coupons";
import { recordFunnelEvent, SID_HEADER } from "../../../../lib/funnel-events";
import { getAssignedVariantId } from "../../../../lib/ab-testing";
import { writePurchaseSession } from "../../../../lib/purchase-session";

function ok(data: unknown) {
  return NextResponse.json({ success: true, data });
}
function fail(error: string, status = 400) {
  return NextResponse.json({ success: false, error }, { status });
}

async function getNextStepUrl(funnelStepId: string, host: string): Promise<string | null> {
  const current = await db.funnelStep.findUnique({
    where: { id: funnelStepId },
    select: { funnelId: true, order: true },
  });
  if (!current) return null;

  const next = await db.funnelStep.findFirst({
    where: { funnelId: current.funnelId, order: { gt: current.order } },
    orderBy: { order: "asc" },
    select: { slug: true },
  });
  if (!next) return null;

  const isDev = process.env.NODE_ENV === "development";
  const isLocal = host.startsWith("localhost") || host.startsWith("127.");
  const protocol = isDev || isLocal ? "http" : "https";
  return `${protocol}://${host}/${next.slug}`;
}

async function markOrderPaid(orderId: string) {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order || order.status === "PAID" || order.status === "TRIAL") return;

  const sub = order.subscriptionId
    ? await db.subscription.findUnique({ where: { id: order.subscriptionId } })
    : null;
  const isTrial = !!(sub?.trialEnd && sub.trialEnd.getTime() > Date.now());

  if (isTrial) {
    await db.order.update({ where: { id: orderId }, data: { status: "TRIAL" } });
  } else {
    await db.$transaction([
      db.order.update({ where: { id: orderId }, data: { status: "PAID" } }),
      db.transaction.create({
        data: {
          orderId,
          type: "SALE",
          amount: order.total,
          currency: order.currency,
          reference: order.invoiceId ?? order.providerOrderId,
          status: "COMPLETED",
        },
      }),
    ]);
  }

  await recordCouponUsage(order.workspaceId, order.couponCode);

  await grantOrderResources(orderId).catch((err) =>
    console.error("[/api/checkout/confirm] grantOrderResources(bump)", err),
  );
}

export async function POST(req: NextRequest) {
  try {
    const { orderId, bumpOrderIds } = await req.json();
    if (!orderId) return fail("orderId is required");

    const order = await db.order.findUnique({ where: { id: orderId } });
    if (!order) return fail("Order not found", 404);

    const alreadyDone = order.status === "PAID" || order.status === "TRIAL";
    if (!alreadyDone) {
      const sub = order.subscriptionId
        ? await db.subscription.findUnique({ where: { id: order.subscriptionId } })
        : null;
      const isTrial = !!(sub?.trialEnd && sub.trialEnd.getTime() > Date.now());

      if (isTrial) {
        await db.order.update({ where: { id: orderId }, data: { status: "TRIAL" } });
      } else {
        await db.$transaction([
          db.order.update({ where: { id: orderId }, data: { status: "PAID" } }),
          db.transaction.create({
            data: {
              orderId,
              type: "SALE",
              amount: order.total,
              currency: order.currency,
              reference: order.invoiceId ?? order.providerOrderId,
              status: "COMPLETED",
            },
          }),
          db.contactEvent.create({
            data: {
              contactId: order.contactId,
              type: "PURCHASE",
              data: { orderId, amount: order.total, currency: order.currency },
            },
          }),
        ]);

        // Subscription main offer: the first invoice was just confirmed
        // client-side, so the Stripe sub is active now. Flip our DB record from
        // INCOMPLETE → ACTIVE here instead of waiting for the webhook (which can
        // be delayed or absent locally). Guarded so it never overrides a
        // CANCELED/TRIALING state.
        if (order.subscriptionId) {
          await db.subscription.updateMany({
            where: { id: order.subscriptionId, status: "INCOMPLETE" },
            data: { status: "ACTIVE" },
          });
        }

        // Fire NEW_SALE automation trigger (best-effort)
        const funnelStep = order.funnelStepId
          ? await db.funnelStep.findUnique({ where: { id: order.funnelStepId }, select: { funnelId: true } })
          : null;
        fireTrigger(order.workspaceId, "NEW_SALE", {
          contactId: order.contactId,
          orderId: order.id,
          orderTotal: order.total / 100,
          orderCurrency: order.currency,
          funnelId: funnelStep?.funnelId,
          funnelStepId: order.funnelStepId ?? undefined,
        }).catch(() => {});

        // PURCHASE analytics event — only for funnel-attributed orders.
        if (order.funnelStepId && funnelStep) {
          const sid = req.headers.get(SID_HEADER);
          await recordFunnelEvent({
            type:         "PURCHASE",
            funnelId:     funnelStep.funnelId,
            funnelStepId: order.funnelStepId,
            contactId:    order.contactId,
            orderId:      order.id,
            amountCents:  order.total,
            sessionId:    sid,
            variantId:    await getAssignedVariantId(order.funnelStepId, sid),
          });
        }
      }

      // Record coupon use exactly once, on first PENDING→PAID/TRIAL transition.
      // Must stay inside the !alreadyDone guard — not idempotent.
      await recordCouponUsage(order.workspaceId, order.couponCode);
    }

    // Grant configured resources. Idempotent — runs whether this call or a
    // prior webhook moved the order to PAID/TRIAL.
    await grantOrderResources(order.id).catch((err) =>
      console.error("[/api/checkout/confirm] grantOrderResources", err),
    );

    // Mark bump orders as PAID
    if (Array.isArray(bumpOrderIds) && bumpOrderIds.length > 0) {
      await Promise.all((bumpOrderIds as string[]).map(markOrderPaid));
    }

    // Link this purchase to the visitor's session so a downstream UPSELL /
    // DOWNSELL page can charge them one-click (off-session). Best-effort.
    await writePurchaseSession(req.headers.get(SID_HEADER), {
      contactId:   order.contactId,
      workspaceId: order.workspaceId,
      currency:    order.currency,
      provider:    order.paymentProvider === "paypal" ? "paypal" : order.paymentProvider === "free" ? "free" : "stripe",
      mainOrderId: order.id,
    });

    const host = req.headers.get("host") ?? "localhost:3001";
    const nextStepUrl = order.funnelStepId ? await getNextStepUrl(order.funnelStepId, host) : null;

    // Identity cookie — defensive re-set. Intent endpoint already set it,
    // but some PayPal flows can land here without going through intent on
    // the same browser session (e.g. PayPal redirect on a new device).
    return setLtContactCookie(ok({ nextStepUrl }), order.contactId);
  } catch (error) {
    console.error("[/api/checkout/confirm]", error);
    return fail(error instanceof Error ? error.message : "Internal error", 500);
  }
}
