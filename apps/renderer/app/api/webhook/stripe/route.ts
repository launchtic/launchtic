import { NextRequest, NextResponse } from "next/server";
import { db } from "@launchtic/database";
import { StripeProvider } from "../../../../lib/payments/stripe";
import { fireTrigger } from "../../../../lib/automations";

export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature") ?? "";
  const payload = Buffer.from(await req.arrayBuffer());

  // Stripe sends the account ID in Stripe-Account header for Connect, otherwise use workspace from metadata
  // We iterate all workspaces' stripe configs to find the matching one
  // For simplicity: workspaceId is encoded in the PaymentIntent metadata, so we parse the event first
  // using the raw payload (no signature check yet) to get workspaceId → then verify with correct secret

  let rawEvent: any;
  try {
    rawEvent = JSON.parse(payload.toString());
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let workspaceId: string | undefined =
    rawEvent?.data?.object?.metadata?.workspaceId ??
    rawEvent?.data?.object?.subscription_details?.metadata?.workspaceId;

  // Basil's invoice_payment events have no metadata — resolve workspace via DB lookup by invoice ID
  if (!workspaceId) {
    const rawInvoiceId = rawEvent?.data?.object?.invoice;
    if (typeof rawInvoiceId === "string") {
      const orderForInvoice = await db.order.findFirst({
        where: { invoiceId: rawInvoiceId },
        select: { workspaceId: true },
      });
      workspaceId = orderForInvoice?.workspaceId;
    }
  }

  // Dispute events: Stripe never copies charge metadata onto the dispute object.
  // Resolve workspace by finding the SALE transaction that matches the charge/disputeId.
  if (!workspaceId && rawEvent?.type?.startsWith("charge.dispute.")) {
    const rawObj = rawEvent?.data?.object;
    const rawChargeId: string | undefined = typeof rawObj?.charge === "string" ? rawObj.charge : undefined;
    const rawDisputeId: string | undefined = typeof rawObj?.id === "string" ? rawObj.id : undefined;

    const refCandidates: string[] = [];
    if (rawChargeId) refCandidates.push(rawChargeId);
    if (rawDisputeId) refCandidates.push(rawDisputeId);

    if (refCandidates.length) {
      const txn = await db.transaction.findFirst({
        where: { reference: { in: refCandidates } },
        select: { order: { select: { workspaceId: true } } },
      });
      workspaceId = txn?.order?.workspaceId;
    }
  }

  if (!workspaceId) {
    // Can't verify without workspaceId — accept silently to avoid Stripe retries
    return NextResponse.json({ received: true });
  }

  // Check idempotency
  const eventId: string = rawEvent.id;
  const existing = await db.processedWebhookEvent.findFirst({
    where: { eventId, workspaceId, provider: "stripe" },
  });
  if (existing) return NextResponse.json({ received: true });

  // Get workspace Stripe config
  const settings = await db.workspaceSettings.findUnique({ where: { workspaceId } });
  const config = settings?.stripe as any;
  if (!config?.secretKey || !config?.webhookSecret) {
    return NextResponse.json({ received: true });
  }

  // Verify & parse event
  const provider = new StripeProvider(config.secretKey, config.webhookSecret);
  let event;
  try {
    event = await provider.handleWebhook(payload, signature);
  } catch (err) {
    console.error("[webhook/stripe] parse error:", err);
    return NextResponse.json({ error: "Webhook verification failed" }, { status: 400 });
  }

  // Mark processed
  await db.processedWebhookEvent.create({
    data: { eventId, workspaceId, provider: "stripe" },
  });

  // Handle event
  if (event.type === "noop") return NextResponse.json({ received: true });

  try {
    switch (event.type) {
      case "payment.succeeded": {
        if (!event.providerOrderId) break;
        const order = await db.order.findFirst({
          where: { providerOrderId: event.providerOrderId, workspaceId },
        });
        if (!order || order.status === "PAID") break;

        const ops: any[] = [
          db.order.update({ where: { id: order.id }, data: { status: "PAID" } }),
          db.transaction.create({
            data: {
              orderId: order.id,
              type: "SALE",
              amount: event.amount ?? order.total,
              currency: event.currency ?? order.currency,
              reference: event.chargeId ?? null,
              status: "COMPLETED",
            },
          }),
          db.contactEvent.create({
            data: {
              contactId: order.contactId,
              type: "PURCHASE",
              data: { orderId: order.id, amount: event.amount, currency: event.currency },
            },
          }),
        ];

        // If this is a subscription order, activate the subscription
        if (order.subscriptionId) {
          ops.push(
            db.subscription.update({
              where: { id: order.subscriptionId },
              data: { status: "ACTIVE" },
            })
          );
        }

        await db.$transaction(ops);

        // Fire NEW_SALE automation trigger (best-effort; never block webhook on this)
        const funnelStep = order.funnelStepId
          ? await db.funnelStep.findUnique({ where: { id: order.funnelStepId }, select: { funnelId: true } })
          : null;
        fireTrigger(workspaceId, "NEW_SALE", {
          contactId: order.contactId,
          orderId: order.id,
          orderTotal: (event.amount ?? order.total) / 100,
          orderCurrency: event.currency ?? order.currency,
          funnelId: funnelStep?.funnelId,
          funnelStepId: order.funnelStepId ?? undefined,
        }).catch(() => {});

        break;
      }

      case "payment.failed": {
        if (!event.providerOrderId) break;
        await db.order.updateMany({
          where: { providerOrderId: event.providerOrderId, workspaceId },
          data: { status: "FAILED" },
        });
        break;
      }

      case "invoice_payment.paid": {
        // Fallback path for subscription first-invoice payments when the browser abandons
        // /api/checkout/confirm. Idempotent — skips if Order is already PAID or TRIAL
        // (TRIAL Orders transition to PAID via subscription.renewed on the first real-charge cycle).
        if (!event.invoiceId) break;
        const order = await db.order.findFirst({
          where: { invoiceId: event.invoiceId, workspaceId },
        });
        if (!order || order.status === "PAID" || order.status === "TRIAL") break;

        const ops: any[] = [
          db.order.update({ where: { id: order.id }, data: { status: "PAID" } }),
          db.transaction.create({
            data: {
              orderId: order.id,
              type: "SALE",
              amount: event.amount ?? order.total,
              currency: event.currency ?? order.currency,
              reference: event.invoiceId,
              status: "COMPLETED",
            },
          }),
          db.contactEvent.create({
            data: {
              contactId: order.contactId,
              type: "PURCHASE",
              data: { orderId: order.id, amount: event.amount, currency: event.currency },
            },
          }),
        ];

        if (order.subscriptionId) {
          ops.push(
            db.subscription.update({
              where: { id: order.subscriptionId },
              data: { status: "ACTIVE" },
            })
          );
        }

        await db.$transaction(ops);
        break;
      }

      case "subscription.renewed": {
        if (!event.providerSubId) break;

        // Skip the initial invoice (handled by payment_intent.succeeded)
        if (event.billingReason === "subscription_create") break;

        // Skip if this invoice was already processed
        if (event.invoiceId) {
          const existing = await db.order.findFirst({
            where: { invoiceId: event.invoiceId, workspaceId },
          });
          if (existing) break;
        }

        const sub = await db.subscription.findFirst({
          where: { providerSubId: event.providerSubId, workspaceId },
        });
        if (!sub) break;

        const periodUpdate = {
          status: "ACTIVE" as any,
          ...(event.currentPeriodStart && { currentPeriodStart: new Date(event.currentPeriodStart * 1000) }),
          ...(event.currentPeriodEnd && { currentPeriodEnd: new Date(event.currentPeriodEnd * 1000) }),
        };

        // If there's a TRIAL Order for this subscription, this is the first real charge after trial end.
        // Convert the existing TRIAL Order → PAID instead of creating a duplicate renewal Order.
        const trialOrder = await db.order.findFirst({
          where: { subscriptionId: sub.id, status: "TRIAL", isRenewal: false },
        });

        if (trialOrder) {
          await db.$transaction([
            db.order.update({
              where: { id: trialOrder.id },
              data: { status: "PAID", invoiceId: event.invoiceId ?? trialOrder.invoiceId },
            }),
            db.transaction.create({
              data: {
                orderId: trialOrder.id,
                type: "SALE",
                amount: event.amount ?? trialOrder.total,
                currency: event.currency ?? trialOrder.currency,
                reference: event.invoiceId ?? null,
                status: "COMPLETED",
              },
            }),
            db.contactEvent.create({
              data: {
                contactId: trialOrder.contactId,
                type: "PURCHASE",
                data: { orderId: trialOrder.id, amount: event.amount, currency: event.currency },
              },
            }),
            db.subscription.update({
              where: { id: sub.id },
              data: periodUpdate,
            }),
          ]);
          break;
        }

        const planSnapshot = sub.planSnapshot as any;
        const renewalOrder = await db.order.create({
          data: {
            workspaceId,
            contactId: sub.contactId,
            funnelStepId: sub.funnelStepId,
            stepPricePlanId: sub.stepPricePlanId,
            subscriptionId: sub.id,
            status: "PAID",
            paymentProvider: "stripe",
            providerOrderId: event.providerSubId,
            invoiceId: event.invoiceId,
            isRenewal: true,
            orderItemSnapshot: planSnapshot
              ? {
                  planName: planSnapshot.planName,
                  planType: "SUBSCRIPTION",
                  unitPrice: planSnapshot.finalAmount ?? planSnapshot.amount,
                }
              : undefined,
            subtotal: event.amount ?? 0,
            total: event.amount ?? 0,
            currency: event.currency ?? "usd",
          },
        });

        await db.$transaction([
          db.transaction.create({
            data: {
              orderId: renewalOrder.id,
              type: "SALE",
              amount: event.amount ?? 0,
              currency: event.currency ?? "usd",
              reference: event.invoiceId ?? null,
              status: "COMPLETED",
            },
          }),
          db.subscription.update({
            where: { id: sub.id },
            data: periodUpdate,
          }),
        ]);
        break;
      }

      case "subscription.active":
      case "subscription.trialing":
      case "subscription.past_due":
      case "subscription.canceled": {
        if (!event.providerSubId) break;
        const statusMap: Record<string, string> = {
          "subscription.active": "ACTIVE",
          "subscription.trialing": "TRIALING",
          "subscription.past_due": "PAST_DUE",
          "subscription.canceled": "CANCELED",
        };

        // Snapshot prior state before update — drives dedup for trigger fires.
        // Without this we'd refire SALE_CANCELED on dunning retries or when
        // Stripe replays the same event, and refire SUBSCRIPTION_PAYMENT_FAILED
        // on every past_due retry (Stripe sends one per retry attempt).
        const prior = await db.subscription.findFirst({
          where: { providerSubId: event.providerSubId, workspaceId },
          select: {
            id: true, status: true, contactId: true,
            funnelStepId: true, cancelAtPeriodEnd: true,
            funnelStep: { select: { funnelId: true } },
          },
        });

        await db.subscription.updateMany({
          where: { providerSubId: event.providerSubId, workspaceId },
          data: {
            status: statusMap[event.type] as any,
            ...(event.currentPeriodStart && { currentPeriodStart: new Date(event.currentPeriodStart * 1000) }),
            ...(event.currentPeriodEnd && { currentPeriodEnd: new Date(event.currentPeriodEnd * 1000) }),
            ...(typeof event.cancelAtPeriodEnd === "boolean" && { cancelAtPeriodEnd: event.cancelAtPeriodEnd }),
            ...(event.trialEnd !== undefined && { trialEnd: event.trialEnd ? new Date(event.trialEnd * 1000) : null }),
          },
        });

        if (!prior) break;

        // SUBSCRIPTION_PAYMENT_FAILED — fire only on the ACTIVE/TRIALING→PAST_DUE
        // transition. Skip if already PAST_DUE (Stripe redelivery / dunning).
        if (event.type === "subscription.past_due" && prior.status !== "PAST_DUE") {
          fireTrigger(workspaceId, "SUBSCRIPTION_PAYMENT_FAILED", {
            contactId: prior.contactId,
            subscriptionId: prior.id,
            funnelId: prior.funnelStep?.funnelId,
            funnelStepId: prior.funnelStepId ?? undefined,
          }).catch(() => {});
        }

        // SALE_CANCELED — fire only for EXTERNAL cancels (Stripe Dashboard,
        // customer portal, dunning give-up). Skip when:
        //   - Already CANCELED (event redelivery)
        //   - cancelAtPeriodEnd was true (operator-scheduled cancel via UI;
        //     subscriptions cancel route already fired SALE_CANCELED at schedule time)
        if (
          event.type === "subscription.canceled" &&
          prior.status !== "CANCELED" &&
          !prior.cancelAtPeriodEnd
        ) {
          fireTrigger(workspaceId, "SALE_CANCELED", {
            contactId: prior.contactId,
            subscriptionId: prior.id,
            funnelId: prior.funnelStep?.funnelId,
            funnelStepId: prior.funnelStepId ?? undefined,
          }).catch(() => {});
        }

        // When sub is canceled, clean up any TRIAL Orders tied to it (no money moved).
        if (event.type === "subscription.canceled") {
          await db.order.updateMany({
            where: { subscriptionId: prior.id, status: "TRIAL" },
            data: { status: "CANCELED" },
          });
        }
        break;
      }

      case "payment.refunded": {
        if (!event.refundId || !event.chargeId || !event.amount) break;

        // Idempotency: skip if this refund was already recorded (e.g. via our API)
        const existingRefund = await db.transaction.findFirst({
          where: { reference: event.refundId, type: "REFUND" },
          include: { order: { select: { workspaceId: true } } },
        });
        if (existingRefund && existingRefund.order.workspaceId === workspaceId) break;

        // Find the SALE transaction that matches this charge (to link Order).
        // For one-time orders the reference = chargeId; for renewals it = invoiceId.
        const refOr: { reference: string }[] = [{ reference: event.chargeId }];
        if (event.invoiceId) refOr.push({ reference: event.invoiceId });
        const saleTxn = await db.transaction.findFirst({
          where: {
            type: "SALE",
            OR: refOr,
            order: { workspaceId },
          },
          include: { order: true },
        });
        if (!saleTxn) break;

        const newRefundTotal = saleTxn.order.refundAmount + event.amount;
        const fullyRefunded = event.amountRefunded != null && event.totalAmount != null
          ? event.amountRefunded >= event.totalAmount
          : newRefundTotal >= saleTxn.order.total;

        await db.$transaction([
          db.transaction.create({
            data: {
              orderId: saleTxn.orderId,
              type: "REFUND",
              amount: event.amount,
              currency: event.currency ?? saleTxn.order.currency,
              reference: event.refundId,
              status: "COMPLETED",
            },
          }),
          db.order.update({
            where: { id: saleTxn.orderId },
            data: {
              refundAmount: { increment: event.amount },
              refundedAt: new Date(),
              ...(fullyRefunded && { status: "REFUNDED" }),
            },
          }),
        ]);
        break;
      }

      case "dispute.created": {
        if (!event.chargeId || !event.disputeId || !event.amount) break;

        // Idempotency: skip if this dispute was already recorded
        const existing = await db.transaction.findFirst({
          where: { reference: event.disputeId, type: "CHARGEBACK" },
          include: { order: { select: { workspaceId: true } } },
        });
        if (existing && existing.order.workspaceId === workspaceId) break;

        // Find the SALE transaction for this charge to link the Order.
        // One-time orders store pi_xxx, subscription renewals store in_xxx.
        const disputeRefOr: { reference: string }[] = [{ reference: event.chargeId }];
        if (event.invoiceId) disputeRefOr.push({ reference: event.invoiceId });
        if (event.providerOrderId) disputeRefOr.push({ reference: event.providerOrderId });
        const saleTxn = await db.transaction.findFirst({
          where: {
            type: "SALE",
            OR: disputeRefOr,
            order: { workspaceId },
          },
          select: { orderId: true, order: { select: { currency: true } } },
        });
        if (!saleTxn) break;

        await db.transaction.create({
          data: {
            orderId: saleTxn.orderId,
            type: "CHARGEBACK",
            amount: event.amount,
            currency: event.currency ?? saleTxn.order.currency,
            reference: event.disputeId,
            status: "PENDING", // awaiting final outcome (won/lost)
          },
        });
        break;
      }

      case "dispute.closed": {
        if (!event.disputeId || !event.disputeStatus) break;

        const chargebackTxn = await db.transaction.findFirst({
          where: { reference: event.disputeId, type: "CHARGEBACK" },
          include: { order: { select: { id: true, workspaceId: true, total: true } } },
        });
        if (!chargebackTxn || chargebackTxn.order.workspaceId !== workspaceId) break;

        const lost = event.disputeStatus === "lost";
        const won = event.disputeStatus === "won";
        if (!lost && !won) break; // still in progress — wait for final status

        if (lost) {
          // Merchant lost: treat as forced refund. Mark txn COMPLETED + update Order.
          await db.$transaction([
            db.transaction.update({
              where: { id: chargebackTxn.id },
              data: { status: "COMPLETED" },
            }),
            db.order.update({
              where: { id: chargebackTxn.order.id },
              data: {
                status: "REFUNDED",
                refundAmount: { increment: event.amount ?? chargebackTxn.amount },
                refundedAt: new Date(),
              },
            }),
          ]);
        } else {
          // Merchant won: the chargeback itself did not stick — mark FAILED, leave Order unchanged.
          await db.transaction.update({
            where: { id: chargebackTxn.id },
            data: { status: "FAILED" },
          });
        }
        break;
      }
    }
  } catch (err) {
    console.error("[webhook/stripe] handler error:", err);
  }

  return NextResponse.json({ received: true });
}
