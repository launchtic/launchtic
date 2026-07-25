import { db } from "@launchtic/database";
import { NextRequest, NextResponse } from "next/server";
import { requireAccess } from "../../../../../lib/permissions";
import { getAbResults } from "../../../../../lib/ab-results";

type Props = { params: Promise<{ id: string }> };

async function verifyStep(stepId: string, workspaceId: string) {
  const step = await db.funnelStep.findUnique({
    where: { id: stepId },
    select: { id: true, pageJson: true, abTestActive: true, funnel: { select: { workspaceId: true } } },
  });
  if (!step || step.funnel.workspaceId !== workspaceId) return null;
  return step;
}

// GET /api/funnel-steps/:id/ab — variants + results (all-time over the test).
export async function GET(_req: NextRequest, { params }: Props) {
  const r = await requireAccess("funnels:read");
  if (!r.ok) return r.response;
  const { id } = await params;

  const step = await verifyStep(id, r.workspaceId);
  if (!step) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const results = await getAbResults(id, new Date(0), new Date());
  return NextResponse.json(results);
}

// POST /api/funnel-steps/:id/ab — start a test. Snapshots the current page into
// a Control variant and creates one challenger (a copy, ready to edit), 50/50.
export async function POST(_req: NextRequest, { params }: Props) {
  const r = await requireAccess("funnels:write");
  if (!r.ok) return r.response;
  const { id } = await params;

  const step = await verifyStep(id, r.workspaceId);
  if (!step) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (step.abTestActive) {
    return NextResponse.json({ error: "A test is already running on this step." }, { status: 400 });
  }

  await db.$transaction([
    // Clear any stale variants from a previous test.
    db.stepVariant.deleteMany({ where: { stepId: id } }),
    db.stepVariant.create({ data: { stepId: id, name: "Control",   pageJson: step.pageJson as any, weight: 50, isControl: true  } }),
    db.stepVariant.create({ data: { stepId: id, name: "Variant B", pageJson: step.pageJson as any, weight: 50, isControl: false } }),
    db.funnelStep.update({ where: { id }, data: { abTestActive: true } }),
  ]);

  const results = await getAbResults(id, new Date(0), new Date());
  return NextResponse.json(results, { status: 201 });
}

// DELETE /api/funnel-steps/:id/ab — stop the test WITHOUT promoting. The step
// keeps its current pageJson (= the control), variants are discarded.
export async function DELETE(_req: NextRequest, { params }: Props) {
  const r = await requireAccess("funnels:write");
  if (!r.ok) return r.response;
  const { id } = await params;

  const step = await verifyStep(id, r.workspaceId);
  if (!step) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.$transaction([
    db.stepVariant.deleteMany({ where: { stepId: id } }),
    db.funnelStep.update({ where: { id }, data: { abTestActive: false } }),
  ]);

  return NextResponse.json({ ok: true });
}
