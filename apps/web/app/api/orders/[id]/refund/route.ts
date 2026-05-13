import { NextRequest } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";
import { fireTrigger } from "../../../../../lib/automations";

// Look up funnelId for trigger context — Order stores only funnelStepId.
async function resolveFunnelId(funnelStepId: string | null): Promise<string | undefined> {
  if (!funnelStepId) return undefined;
  const step = await db.funnelStep.findUnique({
    where: { id: funnelStepId },
    select: { funnelId: true },
  });
  return step?.funnelId;
}

async function getPayPalToken(clientId: string, clientSecret: string, baseUrl: string): Promise<string> {
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal auth failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

const refundSchema = z.object({
  amount: z.number().int().positive().optional(),
  reason: z.enum(["duplicate", "fraudulent", "requested_by_customer"]).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const r = await requireAccess("orders:write");
    if (!r.ok) return r.response;
    const { workspaceId, userId } = r;

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { amount: reqAmount, reason } = refundSchema.parse(body);

    const order = await db.order.findFirst({ where: { id, workspaceId } });
    if (!order) return err("Order not found", 404);
    if (order.status !== "PAID") return err("Only PAID orders can be refunded", 409);
    if (order.paymentProvider !== "stripe" && order.paymentProvider !== "paypal") return err("Refund not supported for this provider", 400);

    const remaining = order.total - order.refundAmount;
    if (remaining <= 0) return err("Order is fully refunded", 409);

    const amount = reqAmount ?? remaining;
    if (amount > remaining) return err(`Amount exceeds remaining refundable (${remaining})`, 400);

    // ─── PayPal refund ────────────────────────────────────────────────────────
    if (order.paymentProvider === "paypal") {
      if (!order.providerOrderId) return err("No PayPal order ID on record", 400);

      const settings = await db.workspaceSettings.findUnique({ where: { workspaceId } });
      const config = (settings?.paypal as any) ?? {};
      if (!config?.clientId || !config?.clientSecret) return err("PayPal not configured", 500);

      const baseUrl = config.mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
      const token = await getPayPalToken(config.clientId, config.clientSecret, baseUrl);

      let firstRefundId: string;

      if (order.providerOrderId.startsWith("I-")) {
        // Subscription order — PayPal creates separate transactions per charge
        // (e.g. setup_fee for bump + recurring for subscription)
        // Must split refund across all completed transactions
        const start = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
        const end = new Date().toISOString();
        const txRes = await fetch(
          `${baseUrl}/v1/billing/subscriptions/${order.providerOrderId}/transactions?start_time=${start}&end_time=${end}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!txRes.ok) return err("Failed to fetch PayPal subscription transactions", 400);
        const txData = await txRes.json();
        const completedTxs: any[] = (txData.transactions ?? [])
          .filter((t: any) => ["COMPLETED", "PARTIALLY_REFUNDED"].includes(t.status))
          .sort((a: any, b: any) => new Date(a.time).getTime() - new Date(b.time).getTime());

        if (!completedTxs.length) return err("No completed payment found for this subscription", 400);

        let leftToRefund = amount;
        const refundIds: string[] = [];

        for (const tx of completedTxs) {
          if (leftToRefund <= 0) break;
          const txAmountCents = Math.round(parseFloat(tx.amount_with_breakdown?.gross_amount?.value ?? "0") * 100);
          if (txAmountCents === 0) continue;
          const chunkCents = Math.min(leftToRefund, txAmountCents);

          const res = await fetch(`${baseUrl}/v1/payments/sale/${tx.id}/refund`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ amount: { total: (chunkCents / 100).toFixed(2), currency: order.currency.toUpperCase() } }),
          });
          const data = await res.json().catch(() => ({}));

          if (!res.ok) {
            // Transaction already fully refunded — skip and try the next one
            const msg: string = data?.message ?? data?.name ?? "";
            if (msg.toLowerCase().includes("already") || data?.name === "TRANSACTION_ALREADY_REFUNDED") {
              continue;
            }
            return err(msg || "PayPal refund failed", 400);
          }

          refundIds.push(data.id);
          leftToRefund -= chunkCents;
        }

        if (refundIds.length === 0) return err("All transactions have already been refunded", 409);

        firstRefundId = refundIds[0];
      } else {
        // One-time order — single capture
        const orderRes = await fetch(`${baseUrl}/v2/checkout/orders/${order.providerOrderId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!orderRes.ok) return err("Failed to fetch PayPal order details", 400);
        const paypalOrder = await orderRes.json();
        const captureId = paypalOrder.purchase_units?.[0]?.payments?.captures?.[0]?.id;
        if (!captureId) return err("No capture found for this PayPal order", 400);

        const refundRes = await fetch(`${baseUrl}/v2/payments/captures/${captureId}/refund`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ amount: { value: (amount / 100).toFixed(2), currency_code: order.currency.toUpperCase() } }),
        });
        if (!refundRes.ok) {
          const errBody = await refundRes.json().catch(() => ({}));
          return err(errBody?.message ?? "PayPal refund failed", 400);
        }
        const paypalRefund = await refundRes.json();
        firstRefundId = paypalRefund.id;
      }

      // Use a proxy object so the DB update block below works uniformly
      const paypalRefund = { id: firstRefundId };

      const newRefundTotal = order.refundAmount + amount;
      const fullyRefunded = newRefundTotal >= order.total;

      const [, updatedOrder] = await db.$transaction([
        db.transaction.create({
          data: { orderId: order.id, type: "REFUND", amount, currency: order.currency, reference: paypalRefund.id, status: "COMPLETED" },
        }),
        db.order.update({
          where: { id: order.id },
          data: {
            refundAmount: { increment: amount },
            refundedAt: new Date(),
            ...(userId && { refundedByUserId: userId }),
            ...(fullyRefunded && { status: "REFUNDED" }),
          },
        }),
      ]);

      // SALE_CANCELED fires only on full refund. Partial refunds are an
      // adjustment, not a cancellation — automation semantics like "remove
      // customer tag" or "end onboarding sequence" don't apply.
      if (fullyRefunded) {
        const funnelId = await resolveFunnelId(order.funnelStepId);
        fireTrigger(workspaceId, "SALE_CANCELED", {
          contactId: order.contactId,
          orderId: order.id,
          orderTotal: order.total / 100,
          orderCurrency: order.currency,
          funnelId,
          funnelStepId: order.funnelStepId ?? undefined,
        }).catch(() => {});
      }

      return ok({ refundId: paypalRefund.id, amount, refundAmount: updatedOrder.refundAmount, status: updatedOrder.status, fullyRefunded });
    }

    // ─── Stripe refund ────────────────────────────────────────────────────────
    // Find the SALE transaction to identify what to refund
    const saleTxn = await db.transaction.findFirst({
      where: { orderId: order.id, type: "SALE", status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
    });
    if (!saleTxn?.reference) return err("No charge reference found for this order", 400);

    const settings = await db.workspaceSettings.findUnique({ where: { workspaceId } });
    const config = (settings?.stripe as any) ?? {};
    if (!config?.secretKey) return err("Stripe not configured", 500);

    const stripe = new Stripe(config.secretKey, { apiVersion: "2026-04-22.dahlia" });

    // Resolve the refund target. Prefer order.invoiceId (most specific for subscription orders);
    // fall back to the SALE transaction reference which may be charge/payment_intent/invoice/sub id.
    const ref = saleTxn.reference;
    const refundParams: Stripe.RefundCreateParams = {
      amount,
      ...(reason && { reason }),
      metadata: { workspaceId, orderId: order.id, ...(userId && { userId }) },
    };

    type RefundTarget = { payment_intent?: string; charge?: string };

    // Resolve an invoice (any API version) to a refundable target.
    // New Stripe API (Dahlia 2026-03-25) moved payment from top-level invoice.payment_intent
    // into invoice.payments.data[].payment. Handle both shapes.
    async function resolveInvoiceToTarget(invoiceId: string): Promise<RefundTarget | null> {
      const invoice = await stripe.invoices.retrieve(invoiceId, { expand: ["payments"] } as any);

      // New API: invoice.payments.data[{ status, payment: { type, payment_intent?, charge? } }]
      const payments = (invoice as any).payments?.data as any[] | undefined;
      if (payments?.length) {
        for (const p of payments) {
          if (p.status && p.status !== "paid") continue;
          const pay = p.payment ?? p;
          const pi = pay.payment_intent;
          if (pi) return { payment_intent: typeof pi === "string" ? pi : pi.id };
          const ch = pay.charge;
          if (ch) return { charge: typeof ch === "string" ? ch : ch.id };
        }
      }

      // Legacy: top-level fields
      const legacyPi = (invoice as any).payment_intent;
      if (legacyPi) return { payment_intent: typeof legacyPi === "string" ? legacyPi : legacyPi.id };
      const legacyCh = (invoice as any).charge;
      if (legacyCh) return { charge: typeof legacyCh === "string" ? legacyCh : legacyCh.id };

      return null;
    }

    if (order.invoiceId) {
      const target = await resolveInvoiceToTarget(order.invoiceId);
      if (!target) return err("Invoice has no payment to refund", 400);
      Object.assign(refundParams, target);
    } else if (ref.startsWith("ch_")) {
      refundParams.charge = ref;
    } else if (ref.startsWith("pi_")) {
      refundParams.payment_intent = ref;
    } else if (ref.startsWith("in_")) {
      const target = await resolveInvoiceToTarget(ref);
      if (!target) return err("Invoice has no payment to refund", 400);
      Object.assign(refundParams, target);
    } else if (ref.startsWith("sub_")) {
      // Legacy: reference is subscription id. Resolve via latest_invoice.
      const sub = await stripe.subscriptions.retrieve(ref);
      const latestInvoice = (sub as any).latest_invoice;
      if (!latestInvoice) return err("Subscription has no invoice to refund", 400);
      const invoiceId = typeof latestInvoice === "string" ? latestInvoice : latestInvoice.id;
      const target = await resolveInvoiceToTarget(invoiceId);
      if (!target) return err("Invoice has no payment to refund", 400);
      Object.assign(refundParams, target);
    } else {
      return err(`Unrecognized payment reference: ${ref}`, 400);
    }

    const refund = await stripe.refunds.create(refundParams);

    const newRefundTotal = order.refundAmount + refund.amount;
    const fullyRefunded = newRefundTotal >= order.total;

    const [, updatedOrder] = await db.$transaction([
      db.transaction.create({
        data: {
          orderId: order.id,
          type: "REFUND",
          amount: refund.amount,
          currency: refund.currency,
          reference: refund.id,
          status: "COMPLETED",
        },
      }),
      db.order.update({
        where: { id: order.id },
        data: {
          refundAmount: { increment: refund.amount },
          refundedAt: new Date(),
          ...(userId && { refundedByUserId: userId }),
          ...(fullyRefunded && { status: "REFUNDED" }),
        },
      }),
    ]);

    if (fullyRefunded) {
      const funnelId = await resolveFunnelId(order.funnelStepId);
      fireTrigger(workspaceId, "SALE_CANCELED", {
        contactId: order.contactId,
        orderId: order.id,
        orderTotal: order.total / 100,
        orderCurrency: order.currency,
        funnelId,
        funnelStepId: order.funnelStepId ?? undefined,
      }).catch(() => {});
    }

    return ok({
      refundId: refund.id,
      amount: refund.amount,
      refundAmount: updatedOrder.refundAmount,
      status: updatedOrder.status,
      fullyRefunded,
    });
  } catch (error) {
    if (error && typeof error === "object" && "type" in error && (error as any).type?.startsWith("Stripe")) {
      return err((error as any).message ?? "Stripe refund failed", 400);
    }
    return handleError(error);
  }
}
