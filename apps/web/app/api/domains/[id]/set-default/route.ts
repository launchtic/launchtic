import { NextRequest, NextResponse } from "next/server";
import { db } from "@launchtic/database";
import { requireAccess } from "../../../../../lib/permissions";

type Params = { params: Promise<{ id: string }> };

// POST /api/domains/:id/set-default — promote a Domain to be the workspace's
// default. Demotes any existing default in the same workspace atomically.
//
// Validation: switching the default Domain changes which funnels live on which
// URL space — funnels assigned to the OLD default's FunnelDomain stay assigned
// (no-op since default never has FunnelDomain entries by convention), funnels
// without any FunnelDomain shift from old-default-host to new-default-host.
// Slug uniqueness is unchanged because the SET of "funnels on default" is the
// same — only the hostname changed. So no slug re-validation needed here.
export async function POST(_req: NextRequest, { params }: Params) {
  const r = await requireAccess("settings:domains:write");
  if (!r.ok) return r.response;
  const { workspaceId } = r;

  const { id } = await params;
  const domain = await db.domain.findUnique({ where: { id } });
  if (!domain || domain.workspaceId !== workspaceId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!domain.verified) {
    return NextResponse.json(
      { error: "Verify the domain first before promoting to default." },
      { status: 400 },
    );
  }
  if (domain.isDefault) {
    return NextResponse.json(domain);
  }

  // If this Domain currently has FunnelDomain entries (was a custom domain
  // for some funnels), promoting it to default would change those funnels'
  // URL space. Block to avoid silent slug conflicts.
  const assignments = await db.funnelDomain.count({ where: { domainId: id } });
  if (assignments > 0) {
    return NextResponse.json(
      { error: "This domain is assigned to one or more funnels. Unassign first before promoting to default." },
      { status: 409 },
    );
  }

  // Atomic swap: clear existing default, set new default.
  const updated = await db.$transaction([
    db.domain.updateMany({
      where: { workspaceId, isDefault: true },
      data: { isDefault: false },
    }),
    db.domain.update({
      where: { id },
      data: { isDefault: true },
    }),
  ]);

  return NextResponse.json(updated[1]);
}
