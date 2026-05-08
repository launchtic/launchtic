import { auth } from "../../../../../lib/auth";
import { db } from "@launchtic/database";
import { NextRequest, NextResponse } from "next/server";

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
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workspaceId = (session as any).workspaceId as string;
  const { id } = await params;

  const step = await verifyStep(id, workspaceId);
  if (!step) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const bumps = await db.orderBump.findMany({
    where: { funnelStepId: id },
    include: {
      pricePlans: { orderBy: { createdAt: "asc" } },
      resources: { orderBy: { createdAt: "asc" } },
    },
    orderBy: { order: "asc" },
  });

  return NextResponse.json(bumps);
}

export async function POST(req: NextRequest, { params }: Props) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workspaceId = (session as any).workspaceId as string;
  const { id } = await params;

  const step = await verifyStep(id, workspaceId);
  if (!step) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const existing = await db.orderBump.count({ where: { funnelStepId: id } });
  if (existing >= 1) {
    return NextResponse.json({ error: "Only one order bump allowed per step" }, { status: 400 });
  }

  const { label, headline } = await req.json();
  if (!label?.trim()) {
    return NextResponse.json({ error: "label required" }, { status: 400 });
  }

  const bump = await db.orderBump.create({
    data: {
      funnelStepId: id,
      label: label.trim(),
      headline: headline?.trim() ?? null,
      order: 0,
    },
    include: {
      pricePlans: true,
      resources: true,
    },
  });

  return NextResponse.json(bump, { status: 201 });
}
