import { NextRequest, NextResponse } from "next/server";
import { db } from "@launchtic/database";
import { requireAccess } from "../../../../../lib/permissions";

type Props = { params: Promise<{ id: string }> };

async function verifyStep(stepId: string, workspaceId: string) {
  const step = await db.funnelStep.findUnique({
    where: { id: stepId },
    include: { funnel: { select: { workspaceId: true } } },
  });
  if (!step || step.funnel.workspaceId !== workspaceId) return null;
  return step;
}

export async function GET(_req: NextRequest, { params }: Props) {
  const r = await requireAccess();
  if (!r.ok) return r.response;
  const { workspaceId } = r;
  const { id } = await params;

  const step = await verifyStep(id, workspaceId);
  if (!step) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const couponIds: string[] = step.couponIds ?? [];
  const coupons = couponIds.length > 0
    ? await db.coupon.findMany({ where: { id: { in: couponIds }, workspaceId } })
    : [];

  return NextResponse.json({ couponIds, coupons });
}

export async function PATCH(req: NextRequest, { params }: Props) {
  const r = await requireAccess("funnels:write");
  if (!r.ok) return r.response;
  const { workspaceId } = r;
  const { id } = await params;

  const step = await verifyStep(id, workspaceId);
  if (!step) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { couponIds } = await req.json();
  if (!Array.isArray(couponIds)) return NextResponse.json({ error: "couponIds must be an array" }, { status: 400 });

  await db.funnelStep.update({
    where: { id },
    data: { couponIds },
  });

  return NextResponse.json({ couponIds });
}
