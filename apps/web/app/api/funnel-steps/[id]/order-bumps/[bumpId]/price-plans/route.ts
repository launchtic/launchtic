import { db } from "@launchtic/database";
import { NextRequest, NextResponse } from "next/server";
import { requireAccess } from "../../../../../../../lib/permissions";
import { invalidateStepCache } from "../../../../../../../lib/funnels/step-cache";

type Props = { params: Promise<{ id: string; bumpId: string }> };

async function verifyBump(bumpId: string, stepId: string, workspaceId: string) {
  const bump = await db.orderBump.findUnique({
    where: { id: bumpId },
    include: { funnelStep: { include: { funnel: { select: { workspaceId: true, currency: true } } } } },
  });
  if (!bump || bump.funnelStepId !== stepId || bump.funnelStep.funnel.workspaceId !== workspaceId) return null;
  return bump;
}

export async function GET(_req: NextRequest, { params }: Props) {
  const r = await requireAccess("funnels:read");
  if (!r.ok) return r.response;
  const { workspaceId } = r;
  const { id, bumpId } = await params;

  const bump = await verifyBump(bumpId, id, workspaceId);
  if (!bump) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const plans = await db.orderBumpPricePlan.findMany({
    where: { orderBumpId: bumpId },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(plans);
}

export async function POST(req: NextRequest, { params }: Props) {
  // Bump price plans are inline to a bump — gated by the bump perm, not
  // funnels:price_plans:write (that's for STEP price plans, the main offer).
  const r = await requireAccess("funnels:bumps:write");
  if (!r.ok) return r.response;
  const { workspaceId } = r;
  const { id, bumpId } = await params;

  const bump = await verifyBump(bumpId, id, workspaceId);
  if (!bump) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const existing = await db.orderBumpPricePlan.count({ where: { orderBumpId: bumpId } });
  if (existing >= 1) {
    return NextResponse.json({ error: "Only one price plan allowed per order bump" }, { status: 400 });
  }

  const { name, type, amount, interval, trialDays, description } = await req.json();
  if (!name || !type || amount === undefined) {
    return NextResponse.json({ error: "name, type, amount required" }, { status: 400 });
  }

  const plan = await db.orderBumpPricePlan.create({
    data: {
      orderBumpId: bumpId,
      name,
      description: description ?? null,
      type,
      amount: Math.round(amount * 100),
      currency: bump.funnelStep.funnel.currency,
      interval: interval ?? null,
      trialDays: trialDays ?? null,
    },
  });

  await invalidateStepCache(workspaceId, id);

  return NextResponse.json(plan, { status: 201 });
}
