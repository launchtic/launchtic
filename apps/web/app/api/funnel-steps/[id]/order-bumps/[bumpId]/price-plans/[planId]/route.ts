import { db } from "@launchtic/database";
import { NextRequest, NextResponse } from "next/server";
import { requireAccess } from "../../../../../../../../lib/permissions";

type Props = { params: Promise<{ id: string; bumpId: string; planId: string }> };

async function verifyPlan(planId: string, bumpId: string, stepId: string, workspaceId: string) {
  const plan = await db.orderBumpPricePlan.findUnique({
    where: { id: planId },
    include: {
      orderBump: {
        include: { funnelStep: { include: { funnel: { select: { workspaceId: true } } } } },
      },
    },
  });
  if (
    !plan ||
    plan.orderBumpId !== bumpId ||
    plan.orderBump.funnelStepId !== stepId ||
    plan.orderBump.funnelStep.funnel.workspaceId !== workspaceId
  ) return null;
  return plan;
}

export async function PATCH(req: NextRequest, { params }: Props) {
  const r = await requireAccess("funnels:write");
  if (!r.ok) return r.response;
  const { workspaceId } = r;
  const { id, bumpId, planId } = await params;

  const plan = await verifyPlan(planId, bumpId, id, workspaceId);
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const updated = await db.orderBumpPricePlan.update({
    where: { id: planId },
    data: {
      name:        body.name        ?? undefined,
      description: body.description !== undefined ? (body.description || null) : undefined,
      type:        body.type        ?? undefined,
      amount:      body.amount      !== undefined ? Math.round(body.amount * 100) : undefined,
      interval:    body.interval    !== undefined ? body.interval : undefined,
      trialDays:   body.trialDays   !== undefined ? body.trialDays : undefined,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Props) {
  const r = await requireAccess("funnels:write");
  if (!r.ok) return r.response;
  const { workspaceId } = r;
  const { id, bumpId, planId } = await params;

  const plan = await verifyPlan(planId, bumpId, id, workspaceId);
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.orderBumpPricePlan.delete({ where: { id: planId } });
  return NextResponse.json({ ok: true });
}
