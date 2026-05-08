import { NextRequest, NextResponse } from "next/server";
import { db } from "@launchtic/database";
import { getWorkspaceId } from "../../../lib/api";
import {
  assertAllStepSlugsAvailable,
  SlugConflictError,
} from "../../../lib/funnels/slug-validation";

// GET /api/funnel-domains?funnelId=xxx — list domains assigned to funnel
export async function GET(req: NextRequest) {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const funnelId = req.nextUrl.searchParams.get("funnelId");
  if (!funnelId) return NextResponse.json({ error: "funnelId required" }, { status: 400 });

  const funnel = await db.funnel.findUnique({ where: { id: funnelId, workspaceId }, select: { id: true } });
  if (!funnel) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const assignments = await db.funnelDomain.findMany({
    where: { funnelId },
    include: { domain: true },
  });

  return NextResponse.json(assignments.map((a) => a.domain));
}

// POST /api/funnel-domains — assign domain to funnel.
// Validates slug uniqueness BEFORE writing: simulating the post-assignment
// FunnelDomain set and checking every step's slug against the new URL space.
export async function POST(req: NextRequest) {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { funnelId, domainId } = await req.json();
  if (!funnelId || !domainId) {
    return NextResponse.json({ error: "funnelId and domainId required" }, { status: 400 });
  }

  // Verify ownership + load current FunnelDomain set
  const [funnel, domain] = await Promise.all([
    db.funnel.findUnique({
      where: { id: funnelId, workspaceId },
      select: {
        id: true,
        domains: { select: { domain: { select: { id: true, isDefault: true } } } },
      },
    }),
    db.domain.findUnique({
      where: { id: domainId, workspaceId },
      select: { id: true, isDefault: true },
    }),
  ]);

  if (!funnel || !domain) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Linking the funnel to the default Domain is a no-op for URL space
  // (default fallback already serves it). Block to keep the data model clean.
  if (domain.isDefault) {
    return NextResponse.json(
      { error: "Cannot manually assign the default domain — funnels use it automatically." },
      { status: 400 },
    );
  }

  // Compute the post-assignment custom-domain set + validate.
  const currentCustomIds = funnel.domains
    .filter((d) => !d.domain.isDefault)
    .map((d) => d.domain.id);
  const nextCustomIds = Array.from(new Set([...currentCustomIds, domainId]));

  try {
    await assertAllStepSlugsAvailable(workspaceId, funnelId, nextCustomIds);
  } catch (e) {
    if (e instanceof SlugConflictError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    throw e;
  }

  const assignment = await db.funnelDomain.upsert({
    where: { funnelId_domainId: { funnelId, domainId } },
    create: { funnelId, domainId },
    update: {},
  });

  return NextResponse.json(assignment, { status: 201 });
}

// DELETE /api/funnel-domains — unassign custom domain from funnel.
// If this leaves the funnel with no custom domains, it falls back to default
// — re-validate slugs against the default URL space first.
export async function DELETE(req: NextRequest) {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { funnelId, domainId } = await req.json();

  const funnel = await db.funnel.findUnique({
    where: { id: funnelId, workspaceId },
    select: {
      id: true,
      domains: { select: { domain: { select: { id: true, isDefault: true } } } },
    },
  });
  if (!funnel) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Compute the post-removal custom-domain set + validate.
  const nextCustomIds = funnel.domains
    .filter((d) => !d.domain.isDefault && d.domain.id !== domainId)
    .map((d) => d.domain.id);

  try {
    await assertAllStepSlugsAvailable(workspaceId, funnelId, nextCustomIds);
  } catch (e) {
    if (e instanceof SlugConflictError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    throw e;
  }

  await db.funnelDomain.deleteMany({ where: { funnelId, domainId } });
  return new NextResponse(null, { status: 204 });
}
