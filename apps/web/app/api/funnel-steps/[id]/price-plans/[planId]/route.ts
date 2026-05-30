import { db } from "@launchtic/database";
import { NextRequest, NextResponse } from "next/server";
import { requireAccess } from "../../../../../../lib/permissions";
import { invalidateStepCache } from "../../../../../../lib/funnels/step-cache";

type Props = { params: Promise<{ id: string; planId: string }> };

async function verifyPlan(planId: string, stepId: string, workspaceId: string) {
  const plan = await db.stepPricePlan.findUnique({
    where: { id: planId },
    include: { funnelStep: { include: { funnel: { select: { workspaceId: true, currency: true } } } } },
  });
  if (!plan || plan.funnelStepId !== stepId || plan.funnelStep.funnel.workspaceId !== workspaceId) return null;
  return plan;
}

export async function PATCH(req: NextRequest, { params }: Props) {
  const r = await requireAccess("funnels:price_plans:write");
  if (!r.ok) return r.response;
  const { workspaceId } = r;
  const { id, planId } = await params;

  const plan = await verifyPlan(planId, id, workspaceId);
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();

  // Currency invariant: plan currency MUST match the funnel's currency.
  // The renderer displays funnel.currency on the page while charging plan.currency
  // — divergence would silently bill the buyer in a different currency than shown.
  if (body.currency !== undefined &&
      String(body.currency).toLowerCase() !== plan.funnelStep.funnel.currency.toLowerCase()) {
    return NextResponse.json(
      { error: `Plan currency must match the funnel currency (${plan.funnelStep.funnel.currency.toUpperCase()}).` },
      { status: 400 },
    );
  }

  // Stripe Prices and PayPal Billing Plans are IMMUTABLE — you can't change the
  // amount of an existing one. We cache their ids on the plan (stripePriceId /
  // paypalPlanId). If any pricing-defining field changes (incl. trialDays — PayPal
  // bakes the trial into the billing plan), drop those caches so the next
  // checkout/subscription mints a fresh price/plan at the NEW config; otherwise
  // the gateway keeps charging the OLD price / trial schedule.
  const newAmount    = body.amount    !== undefined ? Math.round(body.amount * 100) : plan.amount;
  const newInterval  = body.interval  !== undefined ? body.interval : plan.interval;
  const newCurrency  = body.currency  ?? plan.currency;
  const newType      = body.type      ?? plan.type;
  const newTrialDays = body.trialDays !== undefined ? body.trialDays : plan.trialDays;
  const pricingChanged =
    newAmount !== plan.amount ||
    newInterval !== plan.interval ||
    (newCurrency ?? "").toLowerCase() !== (plan.currency ?? "").toLowerCase() ||
    newType !== plan.type ||
    newTrialDays !== plan.trialDays;

  const updated = await db.stepPricePlan.update({
    where: { id: planId },
    data: {
      name: body.name ?? undefined,
      description: body.description !== undefined ? (body.description || null) : undefined,
      type: body.type ?? undefined,
      amount: body.amount !== undefined ? Math.round(body.amount * 100) : undefined,
      currency: body.currency ?? undefined,
      interval: body.interval !== undefined ? body.interval : undefined,
      trialDays: body.trialDays !== undefined ? body.trialDays : undefined,
      ...(pricingChanged ? { stripePriceId: null, paypalPlanId: null } : {}),
    },
  });

  await invalidateStepCache(workspaceId, id);

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Props) {
  const r = await requireAccess("funnels:price_plans:write");
  if (!r.ok) return r.response;
  const { workspaceId } = r;
  const { id, planId } = await params;

  const plan = await verifyPlan(planId, id, workspaceId);
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await db.stepPricePlan.delete({ where: { id: planId } });
  } catch (e: any) {
    // P2003 = FK constraint — the plan is referenced by an Order/Subscription.
    // We don't allow hard-delete that breaks history; the merchant should
    // archive the plan (e.g. via offer-type swap) rather than delete it.
    if (e?.code === "P2003") {
      return NextResponse.json(
        { error: "Can't delete: this price plan has existing orders or subscriptions referencing it." },
        { status: 409 },
      );
    }
    throw e;
  }
  await invalidateStepCache(workspaceId, id);
  return NextResponse.json({ ok: true });
}
