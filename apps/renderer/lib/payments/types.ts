export interface BumpPlanRow {
  orderBumpId: string;
  planId: string | null;       // null for PHYSICAL bumps (no price plan)
  physicalProductId?: string | null;
  label?: string | null;       // OrderBump.label snapshot (internal identifier)
  productName?: string | null; // physical product name (snapshot)
  planName?: string | null;    // digital plan name (snapshot)
  type: "ONE_TIME" | "SUBSCRIPTION" | "FREE_TRIAL";
  amount: number; // product price only (excl. shippingFee)
  shippingFee?: number;
  currency: string;
  interval?: string | null;
  trialDays?: number | null;
  stripePriceId?: string | null;
}

export type BumpCheckoutResult =
  | { type: "stripe_confirm"; clientSecret: string; orderId: string }
  | { type: "paypal_order"; paypalOrderId: string; orderId: string }
  | { type: "succeeded"; orderId: string };

export interface CheckoutInput {
  workspaceId: string;
  contactId: string;
  funnelStepId: string;
  pricePlanId: string | null;
  physicalProductId: string | null;
  variantId: string | null;
  quantity: number;
  couponCode: string | null;
  orderItemSnapshot: {
    productName?: string | null;
    variantName?: string | null;
    sku?: string | null;
    unitPrice?: number | null;
    planName?: string | null;
    planType?: string | null;
  };
  discountAmount: number;
  shippingFee: number;
  bumpPlans: BumpPlanRow[];
  paymentMethodId: string | null;
  // When true, attach the card to the Stripe customer for later off-session
  // (one-click upsell) charges. Set by the intent route when the funnel has
  // downstream UPSELL/DOWNSELL steps. ONE_TIME only — subscriptions already
  // save a default PM via `save_default_payment_method`.
  savePaymentMethod?: boolean;
  billingDetails: {
    name: string;
    email: string;
    phone?: string;
    address?: {
      line1?: string;
      city?: string;
      postal_code?: string;
      country?: string;
    };
  };
  shippingAddress?: {
    line1: string;
    city: string;
    state?: string;
    postal_code: string;
    country: string;
  };
}

export type CheckoutResult =
  | { type: "stripe_confirm"; clientSecret: string; orderId: string; bumpResults: BumpCheckoutResult[] }
  | { type: "paypal_order"; paypalOrderId: string }
  | { type: "paypal_subscription"; paypalSubscriptionId: string }
  | { type: "succeeded"; orderId: string; bumpResults: BumpCheckoutResult[] };

export type PaymentEventType =
  | "payment.succeeded"
  | "payment.failed"
  | "payment.refunded"
  | "dispute.created"
  | "dispute.closed"
  | "invoice_payment.paid"
  | "subscription.active"
  | "subscription.trialing"
  | "subscription.past_due"
  | "subscription.canceled"
  | "subscription.renewed"
  | "noop";

export interface PaymentEvent {
  type: PaymentEventType;
  providerOrderId?: string;
  providerSubId?: string;
  invoiceId?: string;
  chargeId?: string;
  refundId?: string;
  disputeId?: string;
  disputeReason?: string;
  disputeStatus?: string;      // won | lost | under_review | needs_response | ...
  amount?: number;
  amountRefunded?: number;     // cumulative amount refunded on the charge
  totalAmount?: number;        // original charge amount
  currency?: string;
  workspaceId?: string;
  billingReason?: string;
  currentPeriodStart?: number; // unix timestamp
  currentPeriodEnd?: number;   // unix timestamp
  cancelAtPeriodEnd?: boolean;
  trialEnd?: number | null;    // unix timestamp, null = no trial / ended
}

export type CancelResult = {
  canceledImmediately: boolean;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: number | null;
};

export interface PaymentProvider {
  createCheckout(input: CheckoutInput, pricePlan: PricePlanRow): Promise<CheckoutResult>;
  handleWebhook(payload: Buffer, signature: string): Promise<PaymentEvent>;
  cancelSubscription(providerSubId: string, opts: { immediate: boolean }): Promise<CancelResult>;
}

export interface PricePlanRow {
  id: string;
  name: string;
  type: "ONE_TIME" | "SUBSCRIPTION" | "FREE_TRIAL";
  amount: number;
  currency: string;
  interval?: string | null;
  trialDays?: number | null;
  stripePriceId?: string | null;
  paypalPlanId?: string | null;
}
