import { db } from "@launchtic/database";
import { NextRequest, NextResponse } from "next/server";
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

  const resources = await db.funnelStepResource.findMany({
    where: { funnelStepId: id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(resources);
}

// Toggle a single resource (add if not exists, remove if exists)
export async function PATCH(req: NextRequest, { params }: Props) {
  const r = await requireAccess("funnels:write");
  if (!r.ok) return r.response;
  const { workspaceId } = r;
  const { id } = await params;

  const step = await verifyStep(id, workspaceId);
  if (!step) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { type, resourceId } = await req.json();
  if (!type || !resourceId) {
    return NextResponse.json({ error: "type and resourceId required" }, { status: 400 });
  }

  const existing = await db.funnelStepResource.findUnique({
    where: { funnelStepId_type_resourceId: { funnelStepId: id, type, resourceId } },
  });

  if (existing) {
    await db.funnelStepResource.delete({ where: { id: existing.id } });
  } else {
    await db.funnelStepResource.create({ data: { funnelStepId: id, type, resourceId } });
  }

  const resources = await db.funnelStepResource.findMany({
    where: { funnelStepId: id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(resources);
}
