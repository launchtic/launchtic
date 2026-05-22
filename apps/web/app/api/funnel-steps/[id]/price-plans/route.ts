import { db } from "@launchtic/database";
import { NextRequest, NextResponse } from "next/server";
import { requireAccess } from "../../../../../lib/permissions";

type Props = { params: Promise<{ id: string }> };

async function verifyStep(stepId: string, workspaceId: string) {
  const step = await db.funnelStep.findUnique({
    where: { id: stepId },
    include: { funnel: { select: { workspaceId: true, currency: true } } },
  });
  if (!step || step.funnel.workspaceId !== workspaceId) return null;
  return step;
}

export async function GET(_req: NextRequest, { params }: Props) {
  const r = await requireAccess("funnels:read");
  if (!r.ok) return r.response;
  const { workspaceId } = r;
  const { id } = await params;

  const step = await verifyStep(id, workspaceId);
  if (!step) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const plans = await db.stepPricePlan.findMany({
    where: { funnelStepId: id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(plans);
}

export async function POST(req: NextRequest, { params }: Props) {
  // Price plans are revenue-sensitive — gated separately from funnels:write
  // so a designer can edit page copy/structure without changing what gets
  // charged at checkout.
  const r = await requireAccess("funnels:price_plans:write");
  if (!r.ok) return r.response;
  const { workspaceId } = r;
  const { id } = await params;

  const step = await verifyStep(id, workspaceId);
  if (!step) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { name, type, amount, interval, trialDays, description } = await req.json();
  if (!name || !type || amount === undefined) {
    return NextResponse.json({ error: "name, type, amount required" }, { status: 400 });
  }

  const plan = await db.stepPricePlan.create({
    data: {
      funnelStepId: id,
      name,
      description: description ?? null,
      type,
      amount: Math.round(amount * 100),
      currency: step.funnel.currency,
      interval: interval ?? null,
      trialDays: trialDays ?? null,
    },
  });

  return NextResponse.json(plan, { status: 201 });
}
