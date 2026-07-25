import { NextRequest, NextResponse } from "next/server";
import { db } from "@launchtic/database";
import { requireAccess } from "../../../../../lib/permissions";
import { getFunnelAnalytics, parseRange } from "../../../../../lib/funnel-analytics";

// GET /api/funnels/:id/analytics?from=ISO&to=ISO  (or ?days=30)
// Returns the per-step funnel report for the date window.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireAccess("funnels:read");
  if (!r.ok) return r.response;
  const { workspaceId } = r;
  const { id } = await params;

  // Scope the funnel to the caller's workspace.
  const funnel = await db.funnel.findUnique({ where: { id, workspaceId }, select: { id: true } });
  if (!funnel) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { from, to } = parseRange(req.nextUrl.searchParams);
  const data = await getFunnelAnalytics(id, from, to);
  return NextResponse.json(data);
}
