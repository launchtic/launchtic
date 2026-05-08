import { auth } from "../../../../../../lib/auth";
import { db } from "@launchtic/database";
import { NextRequest, NextResponse } from "next/server";

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
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workspaceId = (session as any).workspaceId as string;
  const { id, planId } = await params;

  const plan = await verifyPlan(planId, id, workspaceId);
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
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
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Props) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workspaceId = (session as any).workspaceId as string;
  const { id, planId } = await params;

  const plan = await verifyPlan(planId, id, workspaceId);
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.stepPricePlan.delete({ where: { id: planId } });
  return NextResponse.json({ ok: true });
}
