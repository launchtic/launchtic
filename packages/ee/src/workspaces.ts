// Multi-workspace — Agency-tier feature (FREE is capped at maxWorkspaces: 1,
// via @launchtic/database's plan.ts). Workspace *cloning* stays in apps/web
// (app/api/workspaces/[id]/clone/route.ts) — it depends on the storage/asset
// pipeline (lib/asset-clone.ts, lib/storage.ts), which is app infra, not
// something a package should reach back into. Only the plan-gate check for
// clone (canCloneWorkspace / canCreateWorkspace) is shared, via
// @launchtic/database.

import { db, canCreateWorkspace, getOrganizationForOwner, getEffectivePlan } from "@launchtic/database";
import { EeError } from "./errors";

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function createWorkspace(userId: string, name: string) {
  // The gate runs against the user's owned Organization — that org's plan
  // controls how many workspaces it can hold (Agency = unlimited). License
  // expiry is folded into the effective plan via getEffectivePlan.
  const organization = await getOrganizationForOwner(userId);
  if (!organization) throw new EeError("Organization not found", 404);

  const currentCount = await db.workspace.count({ where: { organizationId: organization.id } });
  const currentPlan  = getEffectivePlan(organization);

  if (!canCreateWorkspace(currentPlan, currentCount)) {
    throw new EeError("Upgrade to Agency to run multiple workspaces.", 403);
  }

  const baseSlug = slugify(name) || "workspace";
  let slug = baseSlug;
  let attempt = 0;
  while (await db.workspace.findUnique({ where: { slug } })) {
    attempt++;
    slug = `${baseSlug}-${attempt}`;
  }

  // No roles seeded, no WorkspaceMember row for the Owner — the Owner
  // bypasses permission checks via Organization.ownerId. They'll create
  // roles in Settings → Roles before inviting members.
  const workspace = await db.workspace.create({
    data: {
      name,
      slug,
      ownerId:        userId,
      organizationId: organization.id,
    },
  });

  return { id: workspace.id, name: workspace.name, slug: workspace.slug };
}
