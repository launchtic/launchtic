import { NextRequest, NextResponse } from "next/server";
import { db } from "@launchtic/database";
import { requireAccess } from "../../../../../lib/permissions";
import { getOrganizationForWorkspace, getEffectivePlan } from "../../../../../lib/organization";
import { getPlanFeatures } from "../../../../../lib/plan";
import { getFunnelAnalytics, parseRange } from "../../../../../lib/funnel-analytics";

// GET /api/funnels/:id/analytics?from=ISO&to=ISO  (or ?days=30)
// Returns the per-step funnel report for the date window. Gated by the
// funnelAnalytics plan feature (Starter+).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireAccess("funnels:read");
  if (!r.ok) return r.response;
  const { workspaceId } = r;
  const { id } = await params;

  // Plan gate.
  const org  = await getOrganizationForWorkspace(workspaceId);
  const plan = getEffectivePlan(org);
  if (!getPlanFeatures(plan).funnelAnalytics) {
    return NextResponse.json(
      { error: "Funnel analytics is a Starter feature. Upgrade to unlock.", code: "PLAN_LIMIT" },
      { status: 402 },
    );
  }

  // Scope the funnel to the caller's workspace.
  const funnel = await db.funnel.findUnique({ where: { id, workspaceId }, select: { id: true } });
  if (!funnel) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { from, to } = parseRange(req.nextUrl.searchParams);
  const data = await getFunnelAnalytics(id, from, to);
  return NextResponse.json(data);
}
