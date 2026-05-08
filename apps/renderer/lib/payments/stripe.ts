import Stripe from "stripe";
import { db, Prisma } from "@launchtic/database";
import type {
  PaymentProvider, CheckoutInput, CheckoutResult,
  PaymentEvent, PaymentEventType, PricePlanRow, CancelResult,
  BumpPlanRow, BumpCheckoutResult,
} from "./types";
import { toProviderAmount, fromProviderAmount } from "./currency";

// Stripe v22 (Dahlia) moved the billing-cycle window from the Subscription
// object onto each SubscriptionItem. Pull from the first item (single-item
// subs in this codebase) and fall back to null when the field isn't present.
function subPeriod(sub: Stripe.Subscription): { start: number | null; end: number | null } {
  const item = sub.items?.data?.[0] as (Stripe.SubscriptionItem & { current_period_start?: number; current_period_end?: number }) | undefined;
  return {
    start: item?.current_period_start ?? null,
    end: item?.current_period_end ?? null,
  };
}

export class StripeProvider implements PaymentProvider {
  private stripe: Stripe;
  private webhookSecret: string;

  constructor(secretKey: string, webhookSecret: string) {
    this.stripe = new Stripe(secretKey, { apiVersion: "2026-04-22.dahlia" });
    this.webhookSecret = webhookSecret;
  }

  // Stripe pins each Customer to the currency of its first PaymentIntent/Subscription.
  // A contact buying across funnels with different currencies needs one Stripe Customer
  // per currency, so we cache by (contactId, currency).
  //
  // Storage shape on Contact.providerCustomerIds:
  //   { stripe: { usd: "cus_x", jpy: "cus_y" }, paypal: "..." }
  // Legacy shape `stripe: "cus_x"` (string) is discarded — currency unknown, Stripe would
  // reject reuse if it doesn't match. Old customers remain in Stripe but harmlessly orphaned.
  private async getOrCreateCustomer(contactId: string, currency: string): Promise<string> {
    const contact = await db.contact.findUnique({ where: { id: contactId } });
    if (!contact) throw new Error("Contact not found");

    const cur = currency.toLowerCase();
    const ids = (contact.providerCustomerIds as Record<string, any>) ?? {};
    const stripeMap: Record<string, string> =
      ids.stripe && typeof ids.stripe === "object" ? { ...ids.stripe } : {};

    if (stripeMap[cur]) return stripeMap[cur];

    const customer = await this.stripe.customers.create({
      email: contact.email,
      name: [contact.firstName, contact.lastName].filter(Boolean).join(" ") || undefined,
    });

    stripeMap[cur] = customer.id;
    await db.contact.update({
      where: { id: contactId },
      data: { providerCustomerIds: { ...ids, stripe: stripeMap } },
    });

    return customer.id;
  }

  async createCheckout(input: CheckoutInput, plan: PricePlanRow): Promise<CheckoutResult> {
    const customerId = await this.getOrCreateCustomer(input.contactId, plan.currency);
    if (plan.type === "ONE_TIME") {
      return this.createOneTimePayment(input, plan, customerId);
    }
    return this.createSubscription(input, plan, customerId);
  }

  // ─── Bump subscription (creates a separate Stripe subscription per bump) ───
  private async createBumpSubscription(
    bump: BumpPlanRow,
    customerId: string,
    input: CheckoutInput,
  ): Promise<BumpCheckoutResult> {
    const trialDays = bump.trialDays ?? 0;

    // Get or create Stripe Price
    let stripePriceId = bump.stripePriceId ?? "";
    if (stripePriceId) {
      try {
        const cached = await this.stripe.prices.retrieve(stripePriceId);
        if (!cached.active) stripePriceId = "";
      } catch (e: any) {
        if (e?.code === "resource_missing") stripePriceId = "";
        else throw e;
      }
    }
    if (!stripePriceId) {
      const price = await this.stripe.prices.create({
        unit_amount: toProviderAmount(bump.amount, bump.currency),
        currency: bump.currency,
        recurring: { interval: (bump.interval ?? "month") as "month" | "year" },
        product_data: { name: bump.planName! },
      });
      stripePriceId = price.id;
      if (bump.planId) {
        await db.orderBumpPricePlan.update({ where: { id: bump.planId }, data: { stripePriceId } });
      }
    }

    const sub = await this.stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: stripePriceId }],
      payment_behavior: "default_incomplete",
      payment_settings: {
        payment_method_types: ["card"],
        save_default_payment_method: "on_subscription",
      },
      trial_period_days: trialDays > 0 ? trialDays : undefined,
      metadata: { workspaceId: input.workspaceId },
    });

    const subExpanded = await this.stripe.subscriptions.retrieve(sub.id, {
      expand: ["latest_invoice"],
    });
    const rawInvoice = (subExpanded as any).latest_invoice;
    const invoiceId: string | null = typeof rawInvoice === "string" ? rawInvoice : rawInvoice?.id ?? null;

    let clientSecret: string;
    if (trialDays > 0) {
      const subWithSetup = await this.stripe.subscriptions.retrieve(sub.id, {
        expand: ["pending_setup_intent"],
      });
      const setupIntent = (subWithSetup as any).pending_setup_intent;
      if (!setupIntent?.client_secret) throw new Error("No setup intent for trial bump subscription");
      clientSecret = setupIntent.client_secret;
    } else {
      if (!invoiceId) throw new Error("Bump subscription has no invoice");
      const invoice = await this.stripe.invoices.retrieve(invoiceId, {
        expand: ["confirmation_secret"],
      });
      const confirmationSecret = (invoice as any).confirmation_secret as { client_secret?: string } | undefined;
      if (!confirmationSecret?.client_secret) throw new Error("No confirmation secret on bump invoice");
      clientSecret = confirmationSecret.client_secret;
    }

    const bumpPeriod = subPeriod(sub);
    const dbSub = await db.subscription.create({
      data: {
        workspaceId: input.workspaceId,
        contactId: input.contactId,
        funnelStepId: input.funnelStepId,
        stepPricePlanId: null,
        orderBumpPricePlanId: bump.planId ?? null,
        status: trialDays > 0 ? "TRIALING" : "INCOMPLETE",
        paymentProvider: "stripe",
        providerSubId: sub.id,
        trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
        currentPeriodStart: bumpPeriod.start ? new Date(bumpPeriod.start * 1000) : null,
        currentPeriodEnd: bumpPeriod.end ? new Date(bumpPeriod.end * 1000) : null,
        planSnapshot: {
          planName: bump.planName!,
          amount: bump.amount,
          finalAmount: bump.amount,
          currency: bump.currency,
          interval: bump.interval ?? "month",
          trialDays: trialDays > 0 ? trialDays : null,
        },
      },
    });

    const contactSnapshot = await db.contact.findUnique({
      where: { id: input.contactId },
      select: { email: true, firstName: true, lastName: true },
    });

    const order = await db.order.create({
      data: {
        workspaceId: input.workspaceId,
        contactId: input.contactId,
        funnelStepId: input.funnelStepId,
        orderBumpPricePlanId: bump.planId ?? null,
        orderItemSnapshot: { planName: bump.planName!, planType: bump.type, unitPrice: bump.amount },
        subscriptionId: dbSub.id,
        status: "PENDING",
        paymentProvider: "stripe",
        paymentMethod: "card",
        paymentMethodId: input.paymentMethodId,
        providerOrderId: sub.id,
        invoiceId,
        subtotal: bump.amount,
        discountAmount: 0,
        total: bump.amount,
        currency: bump.currency,
        contactSnapshot: contactSnapshot ?? Prisma.JsonNull,
      },
    });

    return { type: "stripe_confirm", clientSecret, orderId: order.id };
  }

  private buildBumpItems(bumps: BumpPlanRow[]) {
    return bumps.map(b => ({
      orderBumpId: b.orderBumpId,
      planId: b.planId ?? null,
      physicalProductId: b.physicalProductId ?? null,
      label: b.label ?? null,
      productName: b.productName ?? null,
      planName: b.planName ?? null,
      unitPrice: b.amount,
      shippingFee: b.shippingFee ?? 0,
      total: b.amount + (b.shippingFee ?? 0),
      currency: b.currency,
    }));
  }

  // ─── One-time payment ───────────────────────────────────────────────────────
  private async createOneTimePayment(
    input: CheckoutInput,
    plan: PricePlanRow,
    customerId: string,
  ): Promise<CheckoutResult> {
    const bumpPlans = input.bumpPlans ?? [];
    const oneTimeBumps = bumpPlans.filter(b => b.type === "ONE_TIME");
    const subscriptionBumps = bumpPlans.filter(b => b.type !== "ONE_TIME");

    const subtotal = plan.amount;
    const discountAmount = input.discountAmount ?? 0;
    const shippingFee = input.shippingFee ?? 0;
    const oneTimeBumpTotal = oneTimeBumps.reduce((s, b) => s + b.amount + (b.shippingFee ?? 0), 0);
    const total = Math.max(0, subtotal + shippingFee + oneTimeBumpTotal - discountAmount);

    const contactSnapshot = await db.contact.findUnique({
      where: { id: input.contactId },
      select: { email: true, firstName: true, lastName: true },
    });

    const bumpItemsData = oneTimeBumps.length > 0 ? this.buildBumpItems(oneTimeBumps) : undefined;

    const orderBase = {
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      funnelStepId: input.funnelStepId,
      stepPricePlanId: input.pricePlanId ?? null,
      physicalProductId: input.physicalProductId ?? null,
      variantId: input.variantId ?? null,
      quantity: input.quantity,
      couponCode: input.couponCode ?? null,
      orderItemSnapshot: input.orderItemSnapshot,
      bumpItems: bumpItemsData,
      paymentProvider: "stripe",
      paymentMethod: "card",
      paymentMethodId: input.paymentMethodId,
      subtotal,
      discountAmount,
      shippingFee: input.shippingFee,
      total,
      currency: plan.currency,
      contactSnapshot: contactSnapshot ?? Prisma.JsonNull,
      shippingAddress: input.shippingAddress as any,
    };

    // Free order — skip Stripe charge
    if (total === 0) {
      const order = await db.order.create({
        data: { ...orderBase, status: "PAID", paymentProvider: "free", paymentMethod: "free", paymentMethodId: null },
      });
      await db.contactEvent.create({
        data: { contactId: input.contactId, type: "PURCHASE", data: { orderId: order.id, total: 0 }, ip: null },
      });
      const bumpResults: BumpCheckoutResult[] = oneTimeBumps.map(() => ({ type: "succeeded" as const, orderId: order.id }));
      for (const bump of subscriptionBumps) {
        bumpResults.push(await this.createBumpSubscription(bump, customerId, input));
      }
      return { type: "succeeded", orderId: order.id, bumpResults };
    }

    const order = await db.order.create({ data: { ...orderBase, status: "PENDING" } });

    const intent = await this.stripe.paymentIntents.create({
      amount: toProviderAmount(total, plan.currency),
      currency: plan.currency,
      customer: customerId,
      payment_method: input.paymentMethodId ?? undefined,
      // Save pm to customer so it can be reused for any subscription bump confirmations
      setup_future_usage: subscriptionBumps.length > 0 ? "off_session" : undefined,
      metadata: { orderId: order.id, workspaceId: input.workspaceId },
    });

    await db.order.update({ where: { id: order.id }, data: { providerOrderId: intent.id } });

    const bumpResults: BumpCheckoutResult[] = oneTimeBumps.map(() => ({ type: "succeeded" as const, orderId: order.id }));
    for (const bump of subscriptionBumps) {
      bumpResults.push(await this.createBumpSubscription(bump, customerId, input));
    }

    return { type: "stripe_confirm", clientSecret: intent.client_secret!, orderId: order.id, bumpResults };
  }

  // ─── Subscription payment ───────────────────────────────────────────────────
  private async createSubscription(
    input: CheckoutInput,
    plan: PricePlanRow,
    customerId: string,
  ): Promise<CheckoutResult> {
    const bumpPlans = input.bumpPlans ?? [];
    const oneTimeBumps = bumpPlans.filter(b => b.type === "ONE_TIME");
    const subscriptionBumps = bumpPlans.filter(b => b.type !== "ONE_TIME");

    const discountAmount = input.discountAmount ?? 0;
    const finalAmount = Math.max(0, plan.amount - discountAmount);
    const oneTimeBumpTotal = oneTimeBumps.reduce((s, b) => s + b.amount + (b.shippingFee ?? 0), 0);
    const orderTotal = finalAmount + oneTimeBumpTotal;

    const bumpItemsData = oneTimeBumps.length > 0 ? this.buildBumpItems(oneTimeBumps) : undefined;

    // FREE_TRIAL plan + ONE_TIME bumps: invoice items would be deferred to trial end — must charge today via separate PaymentIntent
    const trialDays = plan.trialDays ?? 0;
    const needsSeparateBumpCharge = trialDays > 0 && oneTimeBumps.length > 0;

    // Subscription amount is $0 forever (100% discount): no recurring billing needed at provider.
    // Create a free DB subscription and, if there's a one-time bump, charge it separately.
    if (finalAmount === 0) {
      const contactSnapshot = await db.contact.findUnique({
        where: { id: input.contactId },
        select: { email: true, firstName: true, lastName: true },
      });
      const dbSub = await db.subscription.create({
        data: {
          workspaceId: input.workspaceId, contactId: input.contactId, funnelStepId: input.funnelStepId,
          stepPricePlanId: plan.id, status: "ACTIVE", paymentProvider: "free",
          providerSubId: `free_${Date.now()}`, trialEnd: null,
          planSnapshot: { planName: plan.name, amount: plan.amount, finalAmount: 0, discountAmount, currency: plan.currency, interval: plan.interval ?? "month", trialDays: null },
        },
      });

      if (oneTimeBumpTotal === 0) {
        const order = await db.order.create({
          data: {
            workspaceId: input.workspaceId, contactId: input.contactId, funnelStepId: input.funnelStepId,
            stepPricePlanId: input.pricePlanId ?? null, couponCode: input.couponCode ?? null,
            orderItemSnapshot: input.orderItemSnapshot, subscriptionId: dbSub.id,
            status: "PAID", paymentProvider: "free", paymentMethod: "free", paymentMethodId: null,
            subtotal: plan.amount, discountAmount, total: 0, currency: plan.currency,
            contactSnapshot: contactSnapshot ?? Prisma.JsonNull,
          },
        });
        const bumpResults: BumpCheckoutResult[] = [];
        for (const bump of subscriptionBumps) {
          bumpResults.push(await this.createBumpSubscription(bump, customerId, input));
        }
        return { type: "succeeded", orderId: order.id, bumpResults };
      }

      // Bump charged via separate PaymentIntent — no auto-attach because no Stripe subscription exists
      if (input.paymentMethodId) {
        await this.stripe.paymentMethods.attach(input.paymentMethodId, { customer: customerId }).catch(() => {});
      }
      // All bumps share plan.currency (enforced in checkout/intent route)
      const bumpPI = await this.stripe.paymentIntents.create({
        amount: toProviderAmount(oneTimeBumpTotal, plan.currency),
        currency: plan.currency,
        customer: customerId,
        payment_method: input.paymentMethodId ?? undefined,
        metadata: { workspaceId: input.workspaceId },
      });
      const order = await db.order.create({
        data: {
          workspaceId: input.workspaceId, contactId: input.contactId, funnelStepId: input.funnelStepId,
          stepPricePlanId: input.pricePlanId ?? null, couponCode: input.couponCode ?? null,
          orderItemSnapshot: input.orderItemSnapshot, bumpItems: bumpItemsData, subscriptionId: dbSub.id,
          status: "PENDING", paymentProvider: "stripe", paymentMethod: "card",
          paymentMethodId: input.paymentMethodId, providerOrderId: bumpPI.id,
          subtotal: plan.amount, discountAmount, total: oneTimeBumpTotal,
          currency: plan.currency,
          contactSnapshot: contactSnapshot ?? Prisma.JsonNull,
          shippingAddress: input.shippingAddress as any,
        },
      });
      const bumpResults: BumpCheckoutResult[] = oneTimeBumps.map(() => ({ type: "succeeded" as const, orderId: order.id }));
      for (const bump of subscriptionBumps) {
        bumpResults.push(await this.createBumpSubscription(bump, customerId, input));
      }
      return { type: "stripe_confirm", clientSecret: bumpPI.client_secret!, orderId: order.id, bumpResults };
    }

    // Add ONE_TIME bumps as invoice items — charged on first subscription invoice
    // Skip for FREE_TRIAL plans: those bumps are charged via a separate PaymentIntent today (see below)
    if (!needsSeparateBumpCharge) {
      for (const bump of oneTimeBumps) {
        await this.stripe.invoiceItems.create({
          customer: customerId,
          amount: toProviderAmount(bump.amount + (bump.shippingFee ?? 0), bump.currency),
          currency: bump.currency,
          description: bump.productName ?? bump.planName ?? "",
        });
      }
    }

    // Get or create Stripe Price
    let stripePriceId = plan.stripePriceId ?? "";
    if (discountAmount > 0) {
      const price = await this.stripe.prices.create({
        unit_amount: toProviderAmount(finalAmount, plan.currency),
        currency: plan.currency,
        recurring: { interval: (plan.interval ?? "month") as "month" | "year" },
        product_data: { name: plan.name },
      });
      stripePriceId = price.id;
    } else {
      if (stripePriceId) {
        try {
          const cached = await this.stripe.prices.retrieve(stripePriceId);
          if (!cached.active) stripePriceId = "";
        } catch (e: any) {
          if (e?.code === "resource_missing") stripePriceId = "";
          else throw e;
        }
      }
      if (!stripePriceId) {
        const price = await this.stripe.prices.create({
          unit_amount: toProviderAmount(plan.amount, plan.currency),
          currency: plan.currency,
          recurring: { interval: (plan.interval ?? "month") as "month" | "year" },
          product_data: { name: plan.name },
        });
        stripePriceId = price.id;
        await db.stepPricePlan.update({ where: { id: plan.id }, data: { stripePriceId } });
      }
    }

    const sub = await this.stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: stripePriceId }],
      payment_behavior: "default_incomplete",
      payment_settings: {
        payment_method_types: ["card"],
        save_default_payment_method: "on_subscription",
      },
      trial_period_days: trialDays > 0 ? trialDays : undefined,
      metadata: { workspaceId: input.workspaceId },
    });

    const contactSnapshot = await db.contact.findUnique({
      where: { id: input.contactId },
      select: { email: true, firstName: true, lastName: true },
    });

    const planSnapshot = {
      planName: plan.name, amount: plan.amount, finalAmount,
      currency: plan.currency, interval: plan.interval ?? "month",
      trialDays: trialDays > 0 ? trialDays : null,
    };

    const subPer = subPeriod(sub);
    const dbSub = await db.subscription.create({
      data: {
        workspaceId: input.workspaceId, contactId: input.contactId, funnelStepId: input.funnelStepId,
        stepPricePlanId: plan.id, status: trialDays > 0 ? "TRIALING" : "INCOMPLETE",
        paymentProvider: "stripe", providerSubId: sub.id,
        trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
        currentPeriodStart: subPer.start ? new Date(subPer.start * 1000) : null,
        currentPeriodEnd: subPer.end ? new Date(subPer.end * 1000) : null,
        planSnapshot,
      },
    });

    const subExpanded = await this.stripe.subscriptions.retrieve(sub.id, { expand: ["latest_invoice"] });
    const rawInvoice = (subExpanded as any).latest_invoice;
    let invoiceId: string | null = typeof rawInvoice === "string" ? rawInvoice : rawInvoice?.id ?? null;

    let clientSecret: string;
    if (trialDays > 0) {
      const subWithSetup = await this.stripe.subscriptions.retrieve(sub.id, { expand: ["pending_setup_intent"] });
      const setupIntent = (subWithSetup as any).pending_setup_intent;
      if (!setupIntent?.client_secret) throw new Error("No setup intent for trial subscription");
      clientSecret = setupIntent.client_secret;
    } else {
      if (!invoiceId) throw new Error("Subscription has no invoice");
      const invoice = await this.stripe.invoices.retrieve(invoiceId, { expand: ["confirmation_secret"] });
      const confirmationSecret = (invoice as any).confirmation_secret as { client_secret?: string } | undefined;
      if (!confirmationSecret?.client_secret) throw new Error("No confirmation secret on invoice");
      clientSecret = confirmationSecret.client_secret;
    }

    const order = await db.order.create({
      data: {
        workspaceId: input.workspaceId, contactId: input.contactId, funnelStepId: input.funnelStepId,
        stepPricePlanId: input.pricePlanId ?? null, couponCode: input.couponCode ?? null,
        orderItemSnapshot: input.orderItemSnapshot,
        // When bumps are charged separately, keep bumpItems off the subscription order
        bumpItems: needsSeparateBumpCharge ? undefined : bumpItemsData,
        subscriptionId: dbSub.id,
        status: "PENDING", paymentProvider: "stripe", paymentMethod: "card",
        paymentMethodId: input.paymentMethodId, providerOrderId: sub.id, invoiceId,
        subtotal: plan.amount, discountAmount,
        // When bumps are charged separately, total reflects the subscription amount only
        total: needsSeparateBumpCharge ? finalAmount : orderTotal,
        currency: plan.currency,
        contactSnapshot: contactSnapshot ?? Prisma.JsonNull,
        shippingAddress: input.shippingAddress as any,
      },
    });

    const bumpResults: BumpCheckoutResult[] = [];

    if (needsSeparateBumpCharge) {
      // FREE_TRIAL subscriptions don't charge immediately so the PM is never auto-attached
      // to the customer. Attach it explicitly so the bump PaymentIntent can use it.
      if (input.paymentMethodId) {
        await this.stripe.paymentMethods.attach(input.paymentMethodId, { customer: customerId }).catch(() => {
          // Ignore if already attached
        });
      }

      // Charge ONE_TIME bumps immediately via a separate PaymentIntent (not deferred to trial end)
      // All bumps share plan.currency (enforced in checkout/intent route)
      const bumpPI = await this.stripe.paymentIntents.create({
        amount: toProviderAmount(oneTimeBumpTotal, plan.currency),
        currency: plan.currency,
        customer: customerId,
        payment_method: input.paymentMethodId ?? undefined,
        metadata: { workspaceId: input.workspaceId },
      });
      const bumpOrder = await db.order.create({
        data: {
          workspaceId: input.workspaceId,
          contactId: input.contactId,
          funnelStepId: input.funnelStepId,
          bumpItems: bumpItemsData,
          status: "PENDING",
          paymentProvider: "stripe",
          paymentMethod: "card",
          paymentMethodId: input.paymentMethodId,
          providerOrderId: bumpPI.id,
          subtotal: oneTimeBumpTotal,
          discountAmount: 0,
          total: oneTimeBumpTotal,
          currency: plan.currency,
          contactSnapshot: contactSnapshot ?? Prisma.JsonNull,
          shippingAddress: input.shippingAddress as any,
        },
      });
      bumpResults.push({ type: "stripe_confirm", clientSecret: bumpPI.client_secret!, orderId: bumpOrder.id });
    } else {
      bumpResults.push(...oneTimeBumps.map(() => ({ type: "succeeded" as const, orderId: order.id })));
    }

    for (const bump of subscriptionBumps) {
      bumpResults.push(await this.createBumpSubscription(bump, customerId, input));
    }

    return { type: "stripe_confirm", clientSecret, orderId: order.id, bumpResults };
  }

  async cancelSubscription(providerSubId: string, opts: { immediate: boolean }): Promise<CancelResult> {
    if (opts.immediate) {
      const sub = await this.stripe.subscriptions.cancel(providerSubId);
      return { canceledImmediately: true, cancelAtPeriodEnd: false, currentPeriodEnd: subPeriod(sub).end };
    }
    const sub = await this.stripe.subscriptions.update(providerSubId, { cancel_at_period_end: true });
    return { canceledImmediately: false, cancelAtPeriodEnd: true, currentPeriodEnd: subPeriod(sub).end };
  }

  async handleWebhook(payload: Buffer, signature: string): Promise<PaymentEvent> {
    const event = this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);

    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        return {
          type: "payment.succeeded",
          providerOrderId: pi.id,
          chargeId: typeof pi.latest_charge === "string" ? pi.latest_charge : (pi.latest_charge as any)?.id,
          amount: fromProviderAmount(pi.amount_received, pi.currency),
          currency: pi.currency,
          workspaceId: pi.metadata?.workspaceId,
        };
      }
      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        return { type: "payment.failed", providerOrderId: pi.id, workspaceId: pi.metadata?.workspaceId };
      }
      case "invoice.paid": {
        const inv = event.data.object as Stripe.Invoice;
        // Stripe v22: subscription moved from inv.subscription to inv.parent.subscription_details.subscription
        const invSub = inv.parent?.subscription_details?.subscription;
        const linePeriod = (inv.lines?.data?.[0] as any)?.period;
        return {
          type: "subscription.renewed",
          providerSubId: typeof invSub === "string" ? invSub : invSub?.id,
          invoiceId: inv.id,
          amount: fromProviderAmount(inv.amount_paid, inv.currency),
          currency: inv.currency,
          billingReason: inv.billing_reason ?? undefined,
          currentPeriodStart: linePeriod?.start ?? undefined,
          currentPeriodEnd: linePeriod?.end ?? undefined,
        };
      }
      case "invoice_payment.paid": {
        const ip = event.data.object as any;
        const rawInvoice = ip.invoice;
        return {
          type: "invoice_payment.paid",
          invoiceId: typeof rawInvoice === "string" ? rawInvoice : rawInvoice?.id,
          amount: fromProviderAmount(ip.amount_paid, ip.currency),
          currency: ip.currency,
        };
      }
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const type: PaymentEventType =
          sub.status === "past_due" ? "subscription.past_due"
          : sub.status === "trialing" ? "subscription.trialing"
          : "subscription.active";
        const per = subPeriod(sub);
        return {
          type, providerSubId: sub.id, workspaceId: sub.metadata?.workspaceId,
          currentPeriodStart: per.start ?? undefined, currentPeriodEnd: per.end ?? undefined,
          cancelAtPeriodEnd: sub.cancel_at_period_end, trialEnd: sub.trial_end ?? null,
        };
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        return { type: "subscription.canceled", providerSubId: sub.id, workspaceId: sub.metadata?.workspaceId, cancelAtPeriodEnd: false };
      }
      case "charge.refunded": {
        const ch = event.data.object as Stripe.Charge;
        const latestRefund = ch.refunds?.data?.[0];
        // Stripe v22: charge.invoice removed. The webhook payload still includes
        // it as a legacy field on the raw object — read defensively via `as any`.
        const chInvoice = (ch as unknown as { invoice?: string | Stripe.Invoice | null }).invoice;
        return {
          type: "payment.refunded",
          chargeId: ch.id,
          invoiceId: typeof chInvoice === "string" ? chInvoice : chInvoice?.id,
          refundId: latestRefund?.id,
          amount: latestRefund?.amount != null ? fromProviderAmount(latestRefund.amount, ch.currency) : undefined,
          amountRefunded: fromProviderAmount(ch.amount_refunded, ch.currency),
          totalAmount: fromProviderAmount(ch.amount, ch.currency),
          currency: ch.currency,
          workspaceId: ch.metadata?.workspaceId,
        };
      }
      case "charge.dispute.created":
      case "charge.dispute.closed": {
        const d = event.data.object as Stripe.Dispute;
        const chargeId = typeof d.charge === "string" ? d.charge : (d.charge as any)?.id;
        let invoiceId: string | undefined;
        let providerOrderId: string | undefined;
        if (chargeId?.startsWith("ch_")) {
          try {
            // Stripe v22: charge.invoice was removed from the typed Charge.
            // It's still returned by the API when expanded — read via `as any`.
            const ch = await this.stripe.charges.retrieve(chargeId, { expand: ["invoice"] });
            const inv = (ch as unknown as { invoice?: string | Stripe.Invoice | null }).invoice;
            if (inv) invoiceId = typeof inv === "string" ? inv : (inv as any).id;
            const pi = ch.payment_intent;
            if (pi) providerOrderId = typeof pi === "string" ? pi : (pi as any).id;
          } catch { /* charge not retrievable */ }
        }
        if (event.type === "charge.dispute.created") {
          return { type: "dispute.created", chargeId, invoiceId, providerOrderId, disputeId: d.id, disputeReason: d.reason, amount: fromProviderAmount(d.amount, d.currency), currency: d.currency, workspaceId: (d.metadata as any)?.workspaceId };
        }
        return { type: "dispute.closed", chargeId, invoiceId, providerOrderId, disputeId: d.id, disputeStatus: d.status, amount: fromProviderAmount(d.amount, d.currency), currency: d.currency, workspaceId: (d.metadata as any)?.workspaceId };
      }
      default:
        return { type: "noop" };
    }
  }
}
