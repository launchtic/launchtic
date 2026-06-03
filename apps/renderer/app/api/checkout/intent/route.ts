import { NextRequest, NextResponse } from "next/server";
import { db } from "@launchtic/database";
import { redis } from "../../../../lib/redis";
import { getProvider } from "../../../../lib/payments/registry";
import type { CheckoutInput, BumpPlanRow } from "../../../../lib/payments/types";
import { isPaypalSupported } from "../../../../lib/payments/currency";
import { fireTrigger } from "../../../../lib/automations";
import { setLtContactCookie } from "../../../../lib/identity-cookie";

function ok(data: Record<string, unknown>) {
  return NextResponse.json({ success: true, ...data });
}
function fail(error: string, status = 400) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { funnelStepId, pricePlanId, paymentMethod, paymentMethodId, customer, shipping, physicalProduct, couponCode, orderBumpIds } = body;

    if (!funnelStepId) return fail("Funnel step ID is missing");
    if (!paymentMethod) return fail("Payment method is missing");
    if (!pricePlanId && !physicalProduct?.id) return fail("No product selected — please select a price plan or product");
    if (!customer?.email) return fail("Email is required");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) return fail("Invalid email address");

    // Get funnel step → workspace
    const step = await db.funnelStep.findUnique({
      where: { id: funnelStepId },
      select: { funnel: { select: { id: true, workspaceId: true } }, shippingFee: true },
    });
    if (!step) return fail("Funnel step not found", 404);
    const { workspaceId } = step.funnel;

    // If the funnel has any UPSELL/DOWNSELL step, save the card to the Stripe
    // customer so those steps can charge one-click (off-session) later.
    const upsellStepCount = await db.funnelStep.count({
      where: { funnelId: step.funnel.id, type: { in: ["UPSELL", "DOWNSELL"] } },
    });
    const savePaymentMethod = upsellStepCount > 0;

    // Get price plan (only if pricePlanId provided — physical product pages won't have one)
    const pricePlan = pricePlanId
      ? await db.stepPricePlan.findUnique({ where: { id: pricePlanId } })
      : null;
    if (pricePlanId && !pricePlan) return fail("Price plan not found", 404);

    // Get physical product from DB (validates it exists and fetches currency)
    const physicalProductRecord = physicalProduct?.id
      ? await db.physicalProduct.findUnique({ where: { id: physicalProduct.id } })
      : null;
    if (physicalProduct?.id && !physicalProductRecord) return fail("Product not found", 404);

    // Upsert contact
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? undefined;
    const contact = await db.contact.upsert({
      where: { workspaceId_email: { workspaceId, email: customer.email } },
      update: {
        firstName: customer.firstName || undefined,
        lastName: customer.lastName || undefined,
        phone: customer.phone || undefined,
        city: customer.city || undefined,
        postalCode: customer.postalCode || undefined,
        country: customer.country || undefined,
        streetAddress: customer.streetAddress || undefined,
        streetNumber: customer.streetNumber || undefined,
        neighborhood: customer.neighborhood || undefined,
        state: customer.state || undefined,
        company: customer.company || undefined,
        taxNumber: customer.taxNumber || undefined,
      },
      create: {
        workspaceId,
        email: customer.email,
        firstName: customer.firstName || undefined,
        lastName: customer.lastName || undefined,
        phone: customer.phone || undefined,
        city: customer.city || undefined,
        postalCode: customer.postalCode || undefined,
        country: customer.country || undefined,
        streetAddress: customer.streetAddress || undefined,
        streetNumber: customer.streetNumber || undefined,
        neighborhood: customer.neighborhood || undefined,
        state: customer.state || undefined,
        company: customer.company || undefined,
        taxNumber: customer.taxNumber || undefined,
        ip,
      },
    });

    // Log FORM_SUBMIT event
    await db.contactEvent.create({
      data: { contactId: contact.id, type: "FORM_SUBMIT", data: { funnelStepId }, ip: ip ?? null },
    });

    // Fire CHECKOUT_STARTED for workflows (cart abandonment recovery, etc.).
    // The workflow's GOAL nodes use condition kind `contact_completed_purchase`
    // to short-circuit if the buyer completes the order in time.
    fireTrigger(workspaceId, "CHECKOUT_STARTED", {
      contactId:    contact.id,
      funnelId:     step?.funnel?.id,
      funnelStepId,
    }).catch(() => {});

    // Validate coupon server-side (if provided)
    let validatedCoupon: { code: string; discountAmount: number; type: string } | null = null;
    if (couponCode) {
      const coupon = await db.coupon.findUnique({
        where: { workspaceId_code: { workspaceId, code: couponCode } },
      });
      const step = await db.funnelStep.findUnique({ where: { id: funnelStepId } }).catch(() => null);
    const stepCouponIds: string[] = (step as any)?.couponIds ?? [];

    if (coupon && coupon.active && stepCouponIds.includes(coupon.id) && (!coupon.expiresAt || coupon.expiresAt > new Date()) && (!coupon.maxUses || coupon.usedCount < coupon.maxUses)) {
        const baseAmount = pricePlan
          ? pricePlan.amount
          : (physicalProduct.unitPrice ?? 0) * (physicalProduct.quantity ?? 1);
        const discountAmount = coupon.type === "percentage"
          ? Math.round(baseAmount * coupon.discount / 100)
          : Math.min(coupon.discount, baseAmount);
        validatedCoupon = { code: coupon.code, discountAmount, type: coupon.type };
      }
    }

    // Validate order bumps and build BumpPlanRow[]
    let bumpPlans: BumpPlanRow[] = [];
    if (Array.isArray(orderBumpIds) && orderBumpIds.length > 0) {
      const bumps = await db.orderBump.findMany({
        where: { id: { in: orderBumpIds }, funnelStepId },
        include: {
          pricePlans: { orderBy: { createdAt: "asc" }, take: 1 },
          physicalProduct: { select: { id: true, name: true, price: true, currency: true } },
        },
      });
      const foundIds = new Set(bumps.map((b: any) => b.id));
      const invalid = (orderBumpIds as string[]).find(id => !foundIds.has(id));
      if (invalid) return fail(`Order bump not found: ${invalid}`, 404);

      bumpPlans = bumps.map((b: any): BumpPlanRow => {
        if (b.offerType === "PHYSICAL" && b.physicalProduct) {
          return {
            orderBumpId: b.id,
            planId: null,
            physicalProductId: b.physicalProduct.id,
            label: b.label,
            productName: b.physicalProduct.name,
            planName: null,
            type: "ONE_TIME",
            amount: b.physicalProduct.price,
            shippingFee: b.shippingFee ?? 0,
            currency: b.physicalProduct.currency,
            interval: null,
            trialDays: null,
            stripePriceId: null,
          };
        }
        const plan = b.pricePlans[0];
        if (!plan) throw new Error(`Order bump ${b.id} has no price plan`);
        return {
          orderBumpId: b.id,
          planId: plan.id,
          label: b.label,
          productName: null,
          planName: plan.name,
          type: plan.type as BumpPlanRow["type"],
          amount: plan.amount,
          currency: plan.currency,
          interval: plan.interval ?? null,
          trialDays: plan.trialDays ?? null,
          stripePriceId: plan.stripePriceId ?? null,
        };
      });
    }

    // Validate shipping address for physical products (main or any bump)
    const hasPhysicalMain = !!physicalProductRecord;
    const hasPhysicalBump = bumpPlans.some(b => b.physicalProductId != null);
    if ((hasPhysicalMain || hasPhysicalBump) && !shipping?.line1) {
      return fail("Shipping address is required for physical products");
    }

    // PayPal does not support recurring bumps (industry standard, see Kartra/CF/GHL).
    // Defensive guard: UI hides them, but reject if a bypass attempt sends them through.
    if (paymentMethod === "paypal" && bumpPlans.some(b => b.type !== "ONE_TIME")) {
      return fail("Recurring add-ons are not supported with PayPal. Switch to credit card to include them.");
    }

    // One currency per checkout — main + bumps must all match. Stripe pins customer to one currency
    // and rejects mixed-currency invoice items; PayPal Order is single-currency. Builder UI should
    // already prevent mismatches; this is the defensive guard.
    const checkoutCurrency = (pricePlan?.currency ?? physicalProductRecord?.currency ?? "").toUpperCase();
    if (checkoutCurrency) {
      const mismatch = bumpPlans.find(b => (b.currency ?? "").toUpperCase() !== checkoutCurrency);
      if (mismatch) {
        return fail(`Add-on "${mismatch.label ?? mismatch.productName ?? mismatch.planName ?? mismatch.orderBumpId}" is in ${(mismatch.currency ?? "").toUpperCase()} but checkout is in ${checkoutCurrency}. All items must share the same currency.`);
      }
    }

    // PayPal supports a limited set of currencies (~25). Reject early so we don't fail at PayPal API.
    if (paymentMethod === "paypal" && checkoutCurrency && !isPaypalSupported(checkoutCurrency)) {
      return fail(`PayPal does not support ${checkoutCurrency}. Switch to credit card.`);
    }

    // Get payment provider & create checkout
    const provider = await getProvider(workspaceId, paymentMethod);

    // Build plan row — for physical products derive from physicalProduct data
    const planRow = pricePlan
      ? {
          id: pricePlan.id,
          name: pricePlan.name,
          type: pricePlan.type as "ONE_TIME" | "SUBSCRIPTION" | "FREE_TRIAL",
          amount: pricePlan.amount,
          currency: pricePlan.currency,
          interval: pricePlan.interval,
          trialDays: pricePlan.trialDays,
          stripePriceId: pricePlan.stripePriceId,
        }
      : {
          id: physicalProduct.id,
          name: physicalProductRecord!.name,
          type: "ONE_TIME" as const,
          amount: (physicalProduct.unitPrice ?? 0) * (physicalProduct.quantity ?? 1),
          currency: physicalProductRecord!.currency,
          interval: null,
          trialDays: null,
          stripePriceId: null,
        };

    // Build orderItemSnapshot
    const physicalVariants = (physicalProductRecord as any)?.variants ?? [];
    const matchedVariant = physicalVariants.find((v: any) => v.id === physicalProduct?.variantId) ?? null;
    const orderItemSnapshot = {
      productName: physicalProductRecord?.name ?? null,
      variantName: matchedVariant?.name ?? null,
      sku: matchedVariant?.sku ?? null,
      unitPrice: physicalProduct?.unitPrice ?? pricePlan?.amount ?? null,
      planName: pricePlan?.name ?? null,
      planType: pricePlan?.type ?? null,
    };

    const input: CheckoutInput = {
      workspaceId,
      contactId: contact.id,
      funnelStepId,
      pricePlanId: pricePlan?.id ?? null,
      physicalProductId: physicalProductRecord?.id ?? null,
      variantId: physicalProduct?.variantId ?? null,
      quantity: physicalProduct?.quantity ?? 1,
      couponCode: validatedCoupon?.code ?? null,
      orderItemSnapshot,
      paymentMethodId,
      billingDetails: {
        name: [customer.firstName, customer.lastName].filter(Boolean).join(" "),
        email: customer.email,
        phone: customer.phone,
        address: {
          line1: customer.streetAddress,
          city: customer.city,
          postal_code: customer.postalCode,
          country: customer.country,
        },
      },
      shippingAddress: shipping,
      discountAmount: validatedCoupon?.discountAmount ?? 0,
      shippingFee: physicalProduct?.id ? (step.shippingFee ?? 0) : 0,
      bumpPlans,
      savePaymentMethod,
    };

    const result = await provider.createCheckout(input, planRow);

    // Store checkout data in Redis so capture/activate can create the DB order
    // without needing the frontend to send it back
    if (result.type === "paypal_order") {
      await redis.setex(`paypal:order:${result.paypalOrderId}`, 900, JSON.stringify({ input, planRow }));
    } else if (result.type === "paypal_subscription") {
      await redis.setex(`paypal:sub:${result.paypalSubscriptionId}`, 900, JSON.stringify({ input, planRow }));
    }

    // Identity cookie — set after upsert so subsequent funnel page visits
    // fire PAGE_VISITED for this contact even if they bounce mid-checkout.
    return setLtContactCookie(ok(result), contact.id);
  } catch (error) {
    console.error("[/api/checkout/intent]", error);
    return fail(error instanceof Error ? error.message : "Internal error", 500);
  }
}
