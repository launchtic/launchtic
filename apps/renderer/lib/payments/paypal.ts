import { db } from "@launchtic/database";
import type {
  PaymentProvider, CheckoutInput, CheckoutResult,
  PaymentEvent, PricePlanRow, CancelResult,
} from "./types";
import { formatAmountForApi } from "./currency";

const SANDBOX_BASE = "https://api-m.sandbox.paypal.com";
const LIVE_BASE    = "https://api-m.paypal.com";

export class PayPalProvider implements PaymentProvider {
  private clientId: string;
  private clientSecret: string;
  private baseUrl: string;
  private _accessToken: string | null = null;
  private _tokenExpiry  = 0;

  constructor(clientId: string, clientSecret: string, mode: "sandbox" | "live" = "sandbox") {
    this.clientId     = clientId;
    this.clientSecret = clientSecret;
    this.baseUrl      = mode === "live" ? LIVE_BASE : SANDBOX_BASE;
  }

  // ─── Auth ──────────────────────────────────────────────────────────────────

  private async accessToken(): Promise<string> {
    if (this._accessToken && Date.now() < this._tokenExpiry) return this._accessToken;
    const creds = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const res   = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) throw new Error(`PayPal token error: ${res.status}`);
    const data = await res.json();
    this._accessToken = data.access_token;
    this._tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return this._accessToken!;
  }

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await this.accessToken();
    const res   = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=representation" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`PayPal ${method} ${path} → ${res.status}: ${text}`);
    return text ? JSON.parse(text) : ({} as T);
  }

  // ─── createCheckout ────────────────────────────────────────────────────────

  async createCheckout(input: CheckoutInput, plan: PricePlanRow): Promise<CheckoutResult> {
    if (plan.type === "ONE_TIME") return this.createOrder(input, plan);
    return this.createSubscription(input, plan);
  }

  // ─── One-time ──────────────────────────────────────────────────────────────

  private async createOrder(input: CheckoutInput, plan: PricePlanRow): Promise<CheckoutResult> {
    const bumpPlans     = input.bumpPlans ?? [];
    const oneTimeBumps  = bumpPlans.filter(b => b.type === "ONE_TIME");

    const discountAmount   = input.discountAmount ?? 0;
    const subtotal         = plan.amount;
    const shippingFee      = input.shippingFee ?? 0;
    const oneTimeBumpTotal = oneTimeBumps.reduce((s, b) => s + b.amount + (b.shippingFee ?? 0), 0);
    const total            = Math.max(0, subtotal + shippingFee + oneTimeBumpTotal - discountAmount);
    const currency         = plan.currency.toUpperCase();

    // Free order — create DB record immediately (no PayPal involved)
    if (total === 0) {
      const contactSnapshot = await db.contact.findUnique({
        where: { id: input.contactId },
        select: { email: true, firstName: true, lastName: true },
      });
      const bumpItemsData = oneTimeBumps.length > 0
        ? oneTimeBumps.map(b => ({
            orderBumpId: b.orderBumpId, planId: b.planId ?? null,
            physicalProductId: b.physicalProductId ?? null, label: b.label ?? null,
            productName: b.productName ?? null, planName: b.planName ?? null,
            unitPrice: b.amount, shippingFee: b.shippingFee ?? 0, total: b.amount + (b.shippingFee ?? 0), currency: b.currency,
          }))
        : undefined;
      const order = await db.order.create({
        data: {
          workspaceId: input.workspaceId, contactId: input.contactId, funnelStepId: input.funnelStepId,
          stepPricePlanId: input.pricePlanId ?? null, couponCode: input.couponCode ?? null,
          orderItemSnapshot: input.orderItemSnapshot, bumpItems: bumpItemsData,
          status: "PAID", paymentProvider: "free", paymentMethod: "free", paymentMethodId: null,
          subtotal, discountAmount, shippingFee, total: 0, currency: plan.currency,
          contactSnapshot: contactSnapshot ?? undefined, shippingAddress: input.shippingAddress as any,
        },
      });
      return { type: "succeeded", orderId: order.id, bumpResults: oneTimeBumps.map(() => ({ type: "succeeded" as const, orderId: order.id })) };
    }

    // Paid — only create PayPal order; DB order created later in /capture after user pays
    const paypalOrder = await this.req<{ id: string }>("POST", "/v2/checkout/orders", {
      intent: "CAPTURE",
      purchase_units: [{ amount: { currency_code: currency, value: formatAmount(total, currency) } }],
      application_context: { shipping_preference: "NO_SHIPPING" },
    });

    return { type: "paypal_order", paypalOrderId: paypalOrder.id };
  }

  // ─── Subscription ──────────────────────────────────────────────────────────

  private async createSubscription(input: CheckoutInput, plan: PricePlanRow): Promise<CheckoutResult> {
    const bumpPlans    = input.bumpPlans ?? [];
    const oneTimeBumps = bumpPlans.filter(b => b.type === "ONE_TIME");
    const discountAmount = input.discountAmount ?? 0;
    const finalAmount    = Math.max(0, plan.amount - discountAmount);
    const oneTimeBumpTotal = oneTimeBumps.reduce((s, b) => s + b.amount + (b.shippingFee ?? 0), 0);
    const currency       = plan.currency.toUpperCase();
    const trialDays      = (plan.trialDays ?? 0);

    const contactSnapshot = await db.contact.findUnique({
      where: { id: input.contactId },
      select: { email: true, firstName: true, lastName: true },
    });

    // Subscription amount is $0 forever (100% discount): no PayPal billing plan needed.
    // Fully free → create free DB sub + order. With bump → charge bump as a one-time PayPal Order.
    if (finalAmount === 0) {
      const bumpItemsData = oneTimeBumps.length > 0
        ? oneTimeBumps.map(b => ({
            orderBumpId: b.orderBumpId, planId: b.planId ?? null,
            physicalProductId: b.physicalProductId ?? null, label: b.label ?? null,
            productName: b.productName ?? null, planName: b.planName ?? null,
            unitPrice: b.amount, shippingFee: b.shippingFee ?? 0,
            total: b.amount + (b.shippingFee ?? 0), currency: b.currency,
          }))
        : undefined;

      if (oneTimeBumpTotal === 0) {
        const dbSub = await db.subscription.create({
          data: {
            workspaceId: input.workspaceId, contactId: input.contactId, funnelStepId: input.funnelStepId,
            stepPricePlanId: plan.id, status: "ACTIVE", paymentProvider: "free",
            providerSubId: `free_${Date.now()}`, trialEnd: null,
            planSnapshot: { planName: plan.name, amount: plan.amount, finalAmount: 0, discountAmount, currency: plan.currency, interval: plan.interval ?? "month", trialDays: null },
          },
        });
        const order = await db.order.create({
          data: {
            workspaceId: input.workspaceId, contactId: input.contactId, funnelStepId: input.funnelStepId,
            stepPricePlanId: input.pricePlanId ?? null, couponCode: input.couponCode ?? null,
            orderItemSnapshot: input.orderItemSnapshot, subscriptionId: dbSub.id,
            status: "PAID", paymentProvider: "free", paymentMethod: "free", paymentMethodId: null,
            subtotal: plan.amount, discountAmount, total: 0, currency: plan.currency,
            contactSnapshot: contactSnapshot ?? undefined,
          },
        });
        return { type: "succeeded", orderId: order.id, bumpResults: [] };
      }

      // Bump charged via one-time PayPal Order. DB sub + order created in capture route.
      const paypalOrder = await this.req<{ id: string }>("POST", "/v2/checkout/orders", {
        intent: "CAPTURE",
        purchase_units: [{ amount: { currency_code: currency, value: formatAmount(oneTimeBumpTotal, currency) } }],
        application_context: { shipping_preference: "NO_SHIPPING" },
      });
      return { type: "paypal_order", paypalOrderId: paypalOrder.id };
    }

    // Get or create PayPal Billing Plan
    let paypalPlanId = plan.paypalPlanId ?? "";
    if (!paypalPlanId) {
      // Ensure product exists
      const product = await this.req<{ id: string }>("POST", "/v1/catalogs/products", {
        name: plan.name,
        type: "SERVICE",
      });

      const planBody: any = {
        product_id: product.id,
        name: plan.name,
        billing_cycles: [
          ...(trialDays > 0 ? [{
            frequency: { interval_unit: "DAY", interval_count: trialDays },
            tenure_type: "TRIAL",
            sequence: 1,
            total_cycles: 1,
            pricing_scheme: { fixed_price: { value: "0", currency_code: currency } },
          }] : []),
          {
            frequency: { interval_unit: (plan.interval ?? "month").toUpperCase() === "YEAR" ? "YEAR" : "MONTH", interval_count: 1 },
            tenure_type: "REGULAR",
            sequence: trialDays > 0 ? 2 : 1,
            total_cycles: 0,
            pricing_scheme: { fixed_price: { value: formatAmount(finalAmount, currency), currency_code: currency } },
          },
        ],
        payment_preferences: {
          auto_bill_outstanding: true,
          setup_fee: oneTimeBumpTotal > 0 ? { value: formatAmount(oneTimeBumpTotal, currency), currency_code: currency } : undefined,
          setup_fee_failure_action: "CONTINUE",
        },
      };

      const created = await this.req<{ id: string; status?: string }>("POST", "/v1/billing/plans", planBody);
      if (created.status !== "ACTIVE") {
        await this.req("POST", `/v1/billing/plans/${created.id}/activate`, undefined);
      }
      paypalPlanId = created.id;

      if (plan.id) {
        await db.stepPricePlan.update({ where: { id: plan.id }, data: { paypalPlanId } as any }).catch(() => {});
      }
    }

    // Create PayPal subscription — user will approve it in the popup
    // DB subscription + order created later in /activate after user approves
    const paypalSub = await this.req<{ id: string }>("POST", "/v1/billing/subscriptions", {
      plan_id: paypalPlanId,
      subscriber: {
        name: { given_name: contactSnapshot?.firstName ?? "", surname: contactSnapshot?.lastName ?? "" },
        email_address: contactSnapshot?.email ?? input.billingDetails.email,
      },
      application_context: { shipping_preference: "NO_SHIPPING", user_action: "SUBSCRIBE_NOW" },
    });

    return { type: "paypal_subscription", paypalSubscriptionId: paypalSub.id };
  }

  // ─── captureOrder ──────────────────────────────────────────────────────────

  async captureOrder(paypalOrderId: string): Promise<{ status: string; payerId: string }> {
    const result = await this.req<any>("POST", `/v2/checkout/orders/${paypalOrderId}/capture`);
    return { status: result.status, payerId: result.payer?.payer_id ?? "" };
  }

  // ─── getSubscription ───────────────────────────────────────────────────────

  async getSubscription(paypalSubscriptionId: string): Promise<{ status: string; startTime: string }> {
    const result = await this.req<any>("GET", `/v1/billing/subscriptions/${paypalSubscriptionId}`);
    return { status: result.status, startTime: result.start_time ?? "" };
  }

  // ─── handleWebhook ─────────────────────────────────────────────────────────

  async handleWebhook(payload: Buffer, signature: string): Promise<PaymentEvent> {
    // PayPal webhook verification requires calling their verify API
    // For now we parse and trust (verification handled at route level via webhook ID check)
    let event: any;
    try { event = JSON.parse(payload.toString()); } catch { return { type: "noop" }; }

    switch (event.event_type) {
      case "PAYMENT.CAPTURE.COMPLETED": {
        const resource = event.resource ?? {};
        // resource.id = capture ID; the v2 Order ID (what we store as Order.providerOrderId) lives in supplementary_data
        const v2OrderId = resource.supplementary_data?.related_ids?.order_id;
        return {
          type: "payment.succeeded",
          providerOrderId: v2OrderId,
          chargeId: resource.id,
          amount: Math.round(parseFloat(resource.amount?.value ?? "0") * 100),
          currency: (resource.amount?.currency_code ?? "usd").toLowerCase(),
        };
      }
      case "PAYMENT.CAPTURE.DENIED": {
        const resource = event.resource ?? {};
        return {
          type: "payment.failed",
          providerOrderId: resource.supplementary_data?.related_ids?.order_id,
          chargeId: resource.id,
        };
      }
      case "PAYMENT.CAPTURE.REVERSED":
      case "PAYMENT.CAPTURE.REFUNDED": {
        // PayPal-initiated reversal or external refund (admin-initiated refunds also fire this).
        const resource = event.resource ?? {};
        return {
          type: "payment.refunded",
          providerOrderId: resource.supplementary_data?.related_ids?.order_id,
          chargeId: resource.supplementary_data?.related_ids?.capture_id ?? resource.id,
          refundId: resource.id,
          amount: Math.round(parseFloat(resource.amount?.value ?? "0") * 100),
          currency: (resource.amount?.currency_code ?? "usd").toLowerCase(),
        };
      }

      case "BILLING.SUBSCRIPTION.ACTIVATED": {
        const sub = event.resource ?? {};
        return {
          type: "subscription.active",
          providerSubId: sub.id,
          currentPeriodStart: sub.start_time ? Math.floor(new Date(sub.start_time).getTime() / 1000) : undefined,
        };
      }
      case "BILLING.SUBSCRIPTION.CANCELLED":
      case "BILLING.SUBSCRIPTION.EXPIRED":
        return { type: "subscription.canceled", providerSubId: event.resource?.id };

      case "BILLING.SUBSCRIPTION.PAYMENT.FAILED":
        return { type: "subscription.past_due", providerSubId: event.resource?.id };

      case "PAYMENT.SALE.COMPLETED": {
        // Recurring payment for a subscription billing agreement (legacy v1 format)
        const sale = event.resource ?? {};
        return {
          type: "subscription.renewed",
          providerSubId: sale.billing_agreement_id,
          chargeId: sale.id,
          amount: Math.round(parseFloat(sale.amount?.total ?? "0") * 100),
          currency: (sale.amount?.currency ?? "usd").toLowerCase(),
        };
      }
      case "PAYMENT.SALE.REFUNDED": {
        // External refund of a subscription sale (legacy v1)
        const refund = event.resource ?? {};
        return {
          type: "payment.refunded",
          providerSubId: refund.billing_agreement_id,
          chargeId: refund.sale_id,
          refundId: refund.id,
          amount: Math.round(Math.abs(parseFloat(refund.amount?.total ?? "0")) * 100),
          currency: (refund.amount?.currency ?? "usd").toLowerCase(),
        };
      }

      case "CUSTOMER.DISPUTE.CREATED": {
        const d = event.resource ?? {};
        const tx = d.disputed_transactions?.[0] ?? {};
        return {
          type: "dispute.created",
          disputeId: d.dispute_id ?? d.id,
          disputeReason: d.reason,
          chargeId: tx.seller_transaction_id,
          amount: Math.round(parseFloat(tx.gross_amount?.value ?? d.dispute_amount?.value ?? "0") * 100),
          currency: (tx.gross_amount?.currency_code ?? d.dispute_amount?.currency_code ?? "usd").toLowerCase(),
        };
      }
      case "CUSTOMER.DISPUTE.RESOLVED": {
        const d = event.resource ?? {};
        const tx = d.disputed_transactions?.[0] ?? {};
        // PayPal outcome maps: RESOLVED_BUYER_FAVOUR → lost, RESOLVED_SELLER_FAVOUR → won
        const outcome = d.dispute_outcome?.outcome_code ?? d.status;
        const mapped = outcome === "RESOLVED_BUYER_FAVOUR" ? "lost"
          : outcome === "RESOLVED_SELLER_FAVOUR" ? "won"
          : outcome;
        return {
          type: "dispute.closed",
          disputeId: d.dispute_id ?? d.id,
          disputeStatus: mapped,
          chargeId: tx.seller_transaction_id,
          amount: Math.round(parseFloat(tx.gross_amount?.value ?? d.dispute_amount?.value ?? "0") * 100),
          currency: (tx.gross_amount?.currency_code ?? d.dispute_amount?.currency_code ?? "usd").toLowerCase(),
        };
      }

      default:
        return { type: "noop" };
    }
  }

  async cancelSubscription(providerSubId: string, _opts: { immediate: boolean }): Promise<CancelResult> {
    await this.req("POST", `/v1/billing/subscriptions/${providerSubId}/cancel`, { reason: "Cancelled by user" });
    return { canceledImmediately: true, cancelAtPeriodEnd: false, currentPeriodEnd: null };
  }

  // ─── Webhook verification ──────────────────────────────────────────────────

  async verifyWebhookSignature(
    webhookId: string,
    headers: Record<string, string>,
    body: string,
  ): Promise<boolean> {
    try {
      const result = await this.req<{ verification_status: string }>(
        "POST", "/v1/notifications/verify-webhook-signature",
        {
          webhook_id: webhookId,
          transmission_id: headers["paypal-transmission-id"],
          transmission_time: headers["paypal-transmission-time"],
          cert_url: headers["paypal-cert-url"],
          auth_algo: headers["paypal-auth-algo"],
          transmission_sig: headers["paypal-transmission-sig"],
          webhook_event: JSON.parse(body),
        },
      );
      return result.verification_status === "SUCCESS";
    } catch {
      return false;
    }
  }
}

// Backwards-compat wrapper. Pass `currency` so JPY/KRW etc. format with 0 decimals.
function formatAmount(amount: number, currency: string): string {
  return formatAmountForApi(amount, currency);
}
