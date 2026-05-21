// Organization-level helpers. The Organization is the billing entity that
// holds plan + license. On self-host there is exactly one Organization per
// instance (founder owns it); each Workspace belongs to it.
//
// Permission checks read plan via the workspace's Organization — NOT via the
// logged-in user — so a team member invited into an Agency workspace sees
// Agency-tier features even if they have no Organization of their own.

import { db } from "@launchtic/database";

/** Fetch the Organization that owns the given Workspace. */
export async function getOrganizationForWorkspace(workspaceId: string) {
  const ws = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { organization: true },
  });
  return ws?.organization ?? null;
}

/**
 * Fetch the Organization owned by this User. Returns null for invited team
 * members who never registered their own install — only the founder owns an
 * Organization on self-host.
 */
export async function getOrganizationForOwner(userId: string) {
  return db.organization.findUnique({ where: { ownerId: userId } });
}

/**
 * Apply license-expiry downgrade. A paid plan with an expired license
 * effectively reverts to COMMUNITY until the user re-validates. Callers
 * should use this for feature gates — never read organization.plan directly
 * when the gate needs to respect expiry.
 */
export function getEffectivePlan(organization: {
  plan: string;
  licenseExpiresAt?: Date | null;
} | null | undefined): string {
  if (!organization) return "COMMUNITY";
  if (organization.plan === "COMMUNITY") return "COMMUNITY";
  if (organization.licenseExpiresAt != null && organization.licenseExpiresAt < new Date()) {
    return "COMMUNITY";
  }
  return organization.plan;
}
