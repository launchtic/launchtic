import { db } from "@launchtic/database";
import { NextRequest, NextResponse } from "next/server";
import { requireAccess } from "../../../../../../lib/permissions";

type Props = { params: Promise<{ id: string }> };

// POST /api/funnel-steps/:id/ab/promote  { variantId }
// Declare a winner: copy the chosen variant's page into the step, end the test,
// and discard all variants. The step now permanently serves the winner.
export async function POST(req: NextRequest, { params }: Props) {
  const r = await requireAccess("funnels:write");
  if (!r.ok) return r.response;
  const { id } = await params;

  const { variantId } = (await req.json().catch(() => ({}))) as { variantId?: string };
  if (!variantId) return NextResponse.json({ error: "variantId required" }, { status: 400 });

  // Scope: step belongs to workspace, variant belongs to step.
  const step = await db.funnelStep.findUnique({
    where: { id },
    select: { id: true, funnel: { select: { workspaceId: true } } },
  });
  if (!step || step.funnel.workspaceId !== r.workspaceId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const variant = await db.stepVariant.findFirst({
    where: { id: variantId, stepId: id },
    select: { pageJson: true },
  });
  if (!variant) return NextResponse.json({ error: "Variant not found" }, { status: 404 });

  await db.$transaction([
    db.funnelStep.update({
      where: { id },
      data: { pageJson: variant.pageJson as any, abTestActive: false },
    }),
    db.stepVariant.deleteMany({ where: { stepId: id } }),
  ]);

  return NextResponse.json({ ok: true });
}
