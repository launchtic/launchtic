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
 * Resolve the effective plan for feature gating.
 *
 * PERPETUAL LICENSE MODEL: the license never expires. `licenseExpiresAt` is the
 * end of the free-UPDATES window, NOT an access cutoff — so we do NOT downgrade
 * when it passes. A customer past their update window keeps every feature of
 * their tier; they just stop receiving new versions (enforced at install/update
 * time, not here).
 *
 * Returns `null` when there is no valid license (pre-activation or revoked) —
 * the locked state. `getPlanFeatures(null)` resolves that to the LOCKED set.
 */
export function getEffectivePlan(organization: {
  plan: string | null;
  licenseExpiresAt?: Date | null;
} | null | undefined): string | null {
  return organization?.plan ?? null;
}
