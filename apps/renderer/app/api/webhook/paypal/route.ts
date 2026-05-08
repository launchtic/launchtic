import { NextRequest, NextResponse } from "next/server";
import { db } from "@launchtic/database";
import { PayPalProvider } from "../../../../lib/payments/paypal";
import { fireTrigger } from "../../../../lib/automations";

function ok() { return NextResponse.json({ received: true }); }

export async function POST(req: NextRequest) {
  const body = await req.text();
  const headers: Record<string, string> = {
    "paypal-transmission-id":   req.headers.get("paypal-transmission-id")   ?? "",
    "paypal-transmission-time": req.headers.get("paypal-transmission-time") ?? "",
    "paypal-cert-url":          req.headers.get("paypal-cert-url")          ?? "",
    "paypal-auth-algo":         req.headers.get("paypal-auth-algo")         ?? "",
    "paypal-transmission-sig":  req.headers.get("paypal-transmission-sig")  ?? "",
  };

  let event: any;
  try { event = JSON.parse(body); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const eventId: string | undefined = event.id;
  const eventType: string | undefined = event.event_type;
  const resource = event.resource ?? {};

  // ─── Resolve workspace ────────────────────────────────────────────────────
  // Different events store the link to our DB on different fields:
  //   PAYMENT.CAPTURE.*       → resource.supplementary_data.related_ids.order_id (= our Order.providerOrderId)
  //   BILLING.SUBSCRIPTION.*  → resource.id (= I-xxx, our Subscription.providerSubId)
  //   PAYMENT.SALE.*          → resource.billing_agreement_id (= I-xxx)
  //   CUSTOMER.DISPUTE.*      → resource.disputed_transactions[0].seller_transaction_id (= capture ID)
  let providerOrderId: string | undefined;
  let providerSubId: string | undefined;
  let captureId: string | undefined;

  if (eventType?.startsWith("PAYMENT.CAPTURE.")) {
    providerOrderId = resource.supplementary_data?.related_ids?.order_id;
    captureId = resource.id;
  } else if (eventType?.startsWith("BILLING.SUBSCRIPTION.")) {
    providerSubId = resource.id;
  } else if (eventType === "PAYMENT.SALE.COMPLETED" || eventType === "PAYMENT.SALE.REFUNDED") {
    providerSubId = resource.billing_agreement_id;
    captureId = resource.id;
  } else if (eventType?.startsWith("CUSTOMER.DISPUTE.")) {
    captureId = resource.disputed_transactions?.[0]?.seller_transaction_id;
  }

  let workspaceId: string | undefined;
  if (providerOrderId) {
    const order = await db.order.findFirst({ where: { providerOrderId }, select: { workspaceId: true } });
    workspaceId = order?.workspaceId;
  }
  if (!workspaceId && providerSubId) {
    const sub = await db.subscription.findFirst({ where: { providerSubId }, select: { workspaceId: true } });
    workspaceId = sub?.workspaceId;
  }
  if (!workspaceId && captureId) {
    // Dispute / refund where we only know the capture (sale) ID — find via Transaction.reference
    const txn = await db.transaction.findFirst({
      where: { reference: captureId },
      select: { order: { select: { workspaceId: true } } },
    });
    workspaceId = txn?.order?.workspaceId;
  }

  if (!workspaceId) return ok(); // Unknown workspace — accept silently to avoid retries

  // ─── Idempotency ─────────────────────────────────────────────────────────
  if (eventId) {
    const existing = await db.processedWebhookEvent.findFirst({
      where: { eventId, workspaceId, provider: "paypal" },
    });
    if (existing) return ok();
  }

  // ─── Verify signature ────────────────────────────────────────────────────
  const settings = await db.workspaceSettings.findUnique({ where: { workspaceId } });
  const paypalConfig = (settings as any)?.paypal;
  if (!paypalConfig?.clientId || !paypalConfig?.clientSecret) return ok();

  const provider = new PayPalProvider(paypalConfig.clientId, paypalConfig.clientSecret, paypalConfig.mode ?? "sandbox");

  if (paypalConfig.webhookId) {
    const valid = await provider.verifyWebhookSignature(paypalConfig.webhookId, headers, body);
    if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  } else {
    console.warn("[webhook/paypal] webhookId not configured for workspace", workspaceId, "— signature verification skipped");
  }

  const paymentEvent = await provider.handleWebhook(Buffer.from(body), "");

  // Mark processed before handler runs to prevent duplicate work on retry
  if (eventId) {
    await db.processedWebhookEvent.create({
      data: { eventId, workspaceId, provider: "paypal" },
    }).catch(() => {/* race: already inserted */});
  }

  if (paymentEvent.type === "noop") return ok();

  try {
    switch (paymentEvent.type) {
      case "subscription.active": {
        if (!paymentEvent.providerSubId) break;
        await db.subscription.updateMany({
          where: { providerSubId: paymentEvent.providerSubId, workspaceId },
          data: { status: "ACTIVE" },
        });
        break;
      }

      case "subscription.canceled": {
        if (!paymentEvent.providerSubId) break;
        // Snapshot prior state — drives SALE_CANCELED dedup. cancelAtPeriodEnd
        // is true when the operator scheduled cancel via our subscriptions
        // cancel route (which already fired SALE_CANCELED). External cancels
        // (PayPal account, NACHA failure auto-cancel after dunning) have
        // cancelAtPeriodEnd=false → fire here.
        const sub = await db.subscription.findFirst({
          where: { providerSubId: paymentEvent.providerSubId, workspaceId },
          select: {
            id: true, status: true, contactId: true,
            funnelStepId: true, cancelAtPeriodEnd: true,
            funnelStep: { select: { funnelId: true } },
          },
        });
        if (!sub) break;
        await db.$transaction([
          db.subscription.update({
            where: { id: sub.id },
            data: { status: "CANCELED" },
          }),
          db.order.updateMany({
            where: { subscriptionId: sub.id, status: "TRIAL" },
            data: { status: "CANCELED" },
          }),
        ]);

        if (sub.status !== "CANCELED" && !sub.cancelAtPeriodEnd) {
          fireTrigger(workspaceId, "SALE_CANCELED", {
            contactId: sub.contactId,
            subscriptionId: sub.id,
            funnelId: sub.funnelStep?.funnelId,
            funnelStepId: sub.funnelStepId ?? undefined,
          }).catch(() => {});
        }
        break;
      }

      case "subscription.past_due": {
        if (!paymentEvent.providerSubId) break;
        // Snapshot prior status — only fire SUBSCRIPTION_PAYMENT_FAILED on the
        // initial transition into PAST_DUE, not on every dunning retry.
        const sub = await db.subscription.findFirst({
          where: { providerSubId: paymentEvent.providerSubId, workspaceId },
          select: {
            id: true, status: true, contactId: true, funnelStepId: true,
            funnelStep: { select: { funnelId: true } },
          },
        });
        await db.subscription.updateMany({
          where: { providerSubId: paymentEvent.providerSubId, workspaceId },
          data: { status: "PAST_DUE" },
        });

        if (sub && sub.status !== "PAST_DUE") {
          fireTrigger(workspaceId, "SUBSCRIPTION_PAYMENT_FAILED", {
            contactId: sub.contactId,
            subscriptionId: sub.id,
            funnelId: sub.funnelStep?.funnelId,
            funnelStepId: sub.funnelStepId ?? undefined,
          }).catch(() => {});
        }
        break;
      }

      case "payment.succeeded": {
        // PAYMENT.CAPTURE.COMPLETED — usually already handled by /api/checkout/capture sync.
        // This branch is a fallback if the browser abandoned the flow before capture finished.
        if (!paymentEvent.providerOrderId) break;
        const order = await db.order.findFirst({
          where: { providerOrderId: paymentEvent.providerOrderId, workspaceId },
        });
        if (!order || order.status === "PAID") break;

        await db.$transaction([
          db.order.update({ where: { id: order.id }, data: { status: "PAID" } }),
          db.transaction.create({
            data: {
              orderId: order.id,
              type: "SALE",
              amount: paymentEvent.amount ?? order.total,
              currency: paymentEvent.currency ?? order.currency,
              reference: paymentEvent.chargeId ?? paymentEvent.providerOrderId,
              status: "COMPLETED",
            },
          }),
          db.contactEvent.create({
            data: {
              contactId: order.contactId,
              type: "PURCHASE",
              data: { orderId: order.id, amount: paymentEvent.amount, currency: paymentEvent.currency },
            },
          }),
        ]);

        // Fire NEW_SALE automation trigger (best-effort)
        const funnelStep = order.funnelStepId
          ? await db.funnelStep.findUnique({ where: { id: order.funnelStepId }, select: { funnelId: true } })
          : null;
        fireTrigger(workspaceId, "NEW_SALE", {
          contactId: order.contactId,
          orderId: order.id,
          orderTotal: (paymentEvent.amount ?? order.total) / 100,
          orderCurrency: paymentEvent.currency ?? order.currency,
          funnelId: funnelStep?.funnelId,
          funnelStepId: order.funnelStepId ?? undefined,
        }).catch(() => {});

        break;
      }

      case "payment.failed": {
        if (!paymentEvent.providerOrderId) break;
        await db.order.updateMany({
          where: { providerOrderId: paymentEvent.providerOrderId, workspaceId, status: { not: "PAID" } },
          data: { status: "FAILED" },
        });
        break;
      }

      case "subscription.renewed": {
        if (!paymentEvent.providerSubId || !paymentEvent.chargeId) break;

        // Idempotency: skip if this sale was already recorded
        const existingSale = await db.transaction.findFirst({
          where: { reference: paymentEvent.chargeId, type: "SALE" },
        });
        if (existingSale) break;

        const sub = await db.subscription.findFirst({
          where: { providerSubId: paymentEvent.providerSubId, workspaceId },
        });
        if (!sub) break;

        // Determine if this is the FIRST charge (initial activation) or a true renewal.
        // PayPal doesn't tell us; infer from existing Orders.
        const initialOrder = await db.order.findFirst({
          where: { subscriptionId: sub.id, isRenewal: false },
          orderBy: { createdAt: "asc" },
          include: { transactions: { where: { type: "SALE" }, take: 1 } },
        });

        // Case A: First sale + initial Order exists with NO SALE Transaction yet
        // (e.g. /activate didn't run or first charge for trial-end). Backfill.
        if (initialOrder && initialOrder.transactions.length === 0) {
          await db.$transaction([
            db.order.update({
              where: { id: initialOrder.id },
              data: { status: "PAID" },
            }),
            db.transaction.create({
              data: {
                orderId: initialOrder.id,
                type: "SALE",
                amount: paymentEvent.amount ?? initialOrder.total,
                currency: paymentEvent.currency ?? initialOrder.currency,
                reference: paymentEvent.chargeId,
                status: "COMPLETED",
              },
            }),
            db.contactEvent.create({
              data: {
                contactId: initialOrder.contactId,
                type: "PURCHASE",
                data: { orderId: initialOrder.id, amount: paymentEvent.amount, currency: paymentEvent.currency },
              },
            }),
            db.subscription.update({
              where: { id: sub.id },
              data: { status: "ACTIVE" },
            }),
          ]);
          break;
        }

        // Case B: First sale already handled by /activate (initialOrder has SALE transaction).
        // Skip if this webhook arrived shortly after activation — heuristic: no renewal Orders yet.
        if (initialOrder && initialOrder.transactions.length > 0) {
          const renewalCount = await db.order.count({
            where: { subscriptionId: sub.id, isRenewal: true },
          });
          // If activation Transaction reference is the sub ID (set by /activate route) and no renewals yet,
          // this PAYMENT.SALE.COMPLETED is the same first charge — skip to avoid duplicate.
          const activationTxn = initialOrder.transactions[0];
          if (renewalCount === 0 && activationTxn.reference === paymentEvent.providerSubId) {
            // Update the activation transaction's reference to the real sale ID for future dedup
            await db.transaction.update({
              where: { id: activationTxn.id },
              data: { reference: paymentEvent.chargeId },
            });
            break;
          }
        }

        // Case C: True renewal — create new renewal Order
        const planSnapshot = sub.planSnapshot as any;
        const renewalOrder = await db.order.create({
          data: {
            workspaceId,
            contactId: sub.contactId,
            funnelStepId: sub.funnelStepId,
            stepPricePlanId: sub.stepPricePlanId,
            subscriptionId: sub.id,
            status: "PAID",
            paymentProvider: "paypal",
            paymentMethod: "paypal",
            providerOrderId: paymentEvent.providerSubId,
            isRenewal: true,
            orderItemSnapshot: planSnapshot
              ? {
                  planName: planSnapshot.planName,
                  planType: "SUBSCRIPTION",
                  unitPrice: planSnapshot.finalAmount ?? planSnapshot.amount,
                }
              : undefined,
            subtotal: paymentEvent.amount ?? 0,
            total: paymentEvent.amount ?? 0,
            currency: paymentEvent.currency ?? "usd",
          },
        });

        await db.$transaction([
          db.transaction.create({
            data: {
              orderId: renewalOrder.id,
              type: "SALE",
              amount: paymentEvent.amount ?? 0,
              currency: paymentEvent.currency ?? "usd",
              reference: paymentEvent.chargeId,
              status: "COMPLETED",
            },
          }),
          db.subscription.update({
            where: { id: sub.id },
            data: { status: "ACTIVE" },
          }),
          db.contactEvent.create({
            data: {
              contactId: sub.contactId,
              type: "PURCHASE",
              data: { orderId: renewalOrder.id, amount: paymentEvent.amount, currency: paymentEvent.currency, isRenewal: true },
            },
          }),
        ]);
        break;
      }

      case "payment.refunded": {
        if (!paymentEvent.refundId || !paymentEvent.amount) break;

        // Idempotency: skip if we already recorded this refund (e.g. via admin /refund route)
        const existingRefund = await db.transaction.findFirst({
          where: { reference: paymentEvent.refundId, type: "REFUND" },
          include: { order: { select: { workspaceId: true } } },
        });
        if (existingRefund && existingRefund.order.workspaceId === workspaceId) break;

        // Find the SALE transaction to link Order — try chargeId (capture/sale ID) and providerSubId
        const refOr: { reference: string }[] = [];
        if (paymentEvent.chargeId) refOr.push({ reference: paymentEvent.chargeId });
        if (paymentEvent.providerSubId) refOr.push({ reference: paymentEvent.providerSubId });
        if (paymentEvent.providerOrderId) refOr.push({ reference: paymentEvent.providerOrderId });
        if (refOr.length === 0) break;

        const saleTxn = await db.transaction.findFirst({
          where: {
            type: "SALE",
            OR: refOr,
            order: { workspaceId },
          },
          include: { order: true },
        });
        if (!saleTxn) break;

        const newRefundTotal = saleTxn.order.refundAmount + paymentEvent.amount;
        const fullyRefunded = newRefundTotal >= saleTxn.order.total;

        await db.$transaction([
          db.transaction.create({
            data: {
              orderId: saleTxn.orderId,
              type: "REFUND",
              amount: paymentEvent.amount,
              currency: paymentEvent.currency ?? saleTxn.order.currency,
              reference: paymentEvent.refundId,
              status: "COMPLETED",
            },
          }),
          db.order.update({
            where: { id: saleTxn.orderId },
            data: {
              refundAmount: { increment: paymentEvent.amount },
              refundedAt: new Date(),
              ...(fullyRefunded && { status: "REFUNDED" }),
            },
          }),
        ]);
        break;
      }

      case "dispute.created": {
        if (!paymentEvent.disputeId || !paymentEvent.chargeId || !paymentEvent.amount) break;

        const existing = await db.transaction.findFirst({
          where: { reference: paymentEvent.disputeId, type: "CHARGEBACK" },
          include: { order: { select: { workspaceId: true } } },
        });
        if (existing && existing.order.workspaceId === workspaceId) break;

        const saleTxn = await db.transaction.findFirst({
          where: {
            type: "SALE",
            reference: paymentEvent.chargeId,
            order: { workspaceId },
          },
          select: { orderId: true, order: { select: { currency: true } } },
        });
        if (!saleTxn) break;

        await db.transaction.create({
          data: {
            orderId: saleTxn.orderId,
            type: "CHARGEBACK",
            amount: paymentEvent.amount,
            currency: paymentEvent.currency ?? saleTxn.order.currency,
            reference: paymentEvent.disputeId,
            status: "PENDING",
          },
        });
        break;
      }

      case "dispute.closed": {
        if (!paymentEvent.disputeId || !paymentEvent.disputeStatus) break;

        const chargebackTxn = await db.transaction.findFirst({
          where: { reference: paymentEvent.disputeId, type: "CHARGEBACK" },
          include: { order: { select: { id: true, workspaceId: true, total: true } } },
        });
        if (!chargebackTxn || chargebackTxn.order.workspaceId !== workspaceId) break;

        const lost = paymentEvent.disputeStatus === "lost";
        const won = paymentEvent.disputeStatus === "won";
        if (!lost && !won) break;

        if (lost) {
          await db.$transaction([
            db.transaction.update({
              where: { id: chargebackTxn.id },
              data: { status: "COMPLETED" },
            }),
            db.order.update({
              where: { id: chargebackTxn.order.id },
              data: {
                status: "REFUNDED",
                refundAmount: { increment: paymentEvent.amount ?? chargebackTxn.amount },
                refundedAt: new Date(),
              },
            }),
          ]);
        } else {
          await db.transaction.update({
            where: { id: chargebackTxn.id },
            data: { status: "FAILED" },
          });
        }
        break;
      }
    }
  } catch (err) {
    console.error("[webhook/paypal] handler error:", err);
  }

  return ok();
}
