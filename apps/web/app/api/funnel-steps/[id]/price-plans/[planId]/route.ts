import { db } from "@launchtic/database";
import { NextRequest, NextResponse } from "next/server";
import { requireAccess } from "../../../../../../lib/permissions";

type Props = { params: Promise<{ id: string; planId: string }> };

async function verifyPlan(planId: string, stepId: string, workspaceId: string) {
  const plan = await db.stepPricePlan.findUnique({
    where: { id: planId },
    include: { funnelStep: { include: { funnel: { select: { workspaceId: true } } } } },
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

  // Stripe Prices and PayPal Billing Plans are IMMUTABLE — you can't change the
  // amount of an existing one. We cache their ids on the plan (stripePriceId /
  // paypalPlanId). If any pricing-defining field changes, drop those caches so
  // the next checkout/subscription mints a fresh price/plan at the NEW amount;
  // otherwise the gateway keeps charging the OLD price.
  const newAmount   = body.amount   !== undefined ? Math.round(body.amount * 100) : plan.amount;
  const newInterval = body.interval !== undefined ? body.interval : plan.interval;
  const newCurrency = body.currency ?? plan.currency;
  const newType     = body.type     ?? plan.type;
  const pricingChanged =
    newAmount !== plan.amount ||
    newInterval !== plan.interval ||
    (newCurrency ?? "").toLowerCase() !== (plan.currency ?? "").toLowerCase() ||
    newType !== plan.type;

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

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Props) {
  const r = await requireAccess("funnels:price_plans:write");
  if (!r.ok) return r.response;
  const { workspaceId } = r;
  const { id, planId } = await params;

  const plan = await verifyPlan(planId, id, workspaceId);
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.stepPricePlan.delete({ where: { id: planId } });
  return NextResponse.json({ ok: true });
}
