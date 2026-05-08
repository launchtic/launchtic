import { auth } from "../../../../../../../lib/auth";
import { db } from "@launchtic/database";
import { NextRequest, NextResponse } from "next/server";

type Props = { params: Promise<{ id: string; bumpId: string }> };

async function verifyBump(bumpId: string, stepId: string, workspaceId: string) {
  const bump = await db.orderBump.findUnique({
    where: { id: bumpId },
    include: { funnelStep: { include: { funnel: { select: { workspaceId: true } } } } },
  });
  if (!bump || bump.funnelStepId !== stepId || bump.funnelStep.funnel.workspaceId !== workspaceId) return null;
  return bump;
}

// Toggle a single resource (add if not exists, remove if exists)
export async function PATCH(req: NextRequest, { params }: Props) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workspaceId = (session as any).workspaceId as string;
  const { id, bumpId } = await params;

  const bump = await verifyBump(bumpId, id, workspaceId);
  if (!bump) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { type, resourceId } = await req.json();
  if (!type || !resourceId) {
    return NextResponse.json({ error: "type and resourceId required" }, { status: 400 });
  }

  const existing = await db.orderBumpResource.findUnique({
    where: { orderBumpId_type_resourceId: { orderBumpId: bumpId, type, resourceId } },
  });

  if (existing) {
    await db.orderBumpResource.delete({ where: { id: existing.id } });
  } else {
    await db.orderBumpResource.create({ data: { orderBumpId: bumpId, type, resourceId } });
  }

  const resources = await db.orderBumpResource.findMany({
    where: { orderBumpId: bumpId },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(resources);
}
