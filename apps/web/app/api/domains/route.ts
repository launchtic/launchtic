import { NextRequest, NextResponse } from "next/server";
import { db } from "@launchtic/database";
import { requireAccess } from "../../../lib/permissions";
import { ensureDefaultDomain } from "../../../lib/domains/default-domain";
import { getOrganizationForWorkspace, getEffectivePlan } from "../../../lib/organization";
import { canAddDomain, getPlanFeatures } from "../../../lib/plan";

export async function GET() {
  const r = await requireAccess("settings:domains:read");
  if (!r.ok) return r.response;
  const { workspaceId } = r;

  await ensureDefaultDomain(workspaceId);

  const domains = await db.domain.findMany({
    where: { workspaceId },
    // Default first, then by creation
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(domains);
}

export async function POST(req: NextRequest) {
  const r = await requireAccess("settings:domains:write");
  if (!r.ok) return r.response;
  const { workspaceId } = r;

  const { domain } = await req.json();
  if (!domain || typeof domain !== "string") {
    return NextResponse.json({ error: "Domain is required" }, { status: 400 });
  }

  // Normalize: strip protocol, trailing slash, port
  const normalized = domain
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .toLowerCase();

  const existing = await db.domain.findUnique({ where: { domain: normalized } });
  if (existing) {
    return NextResponse.json({ error: "Domain already exists" }, { status: 409 });
  }

  // Per-tier custom-domain cap (Solo 3, Starter 10, Agency/Enterprise ∞).
  // The default domain doesn't count — only operator-added custom domains.
  // Counting within the workspace is equivalent to org-wide for the limited
  // tiers (Solo/Starter have a single workspace).
  const org  = await getOrganizationForWorkspace(workspaceId);
  const plan = getEffectivePlan(org);
  const customCount = await db.domain.count({ where: { workspaceId, isDefault: false } });
  if (!canAddDomain(plan, customCount)) {
    const limit = getPlanFeatures(plan).maxDomains;
    return NextResponse.json(
      {
        error: `Your plan includes ${limit} custom domain${limit === 1 ? "" : "s"}. Upgrade to add more.`,
        code:  "PLAN_LIMIT",
      },
      { status: 402 },
    );
  }

  const record = await db.domain.create({
    data: {
      workspaceId,
      domain: normalized,
      verified: false,
    },
  });

  return NextResponse.json(record, { status: 201 });
}
