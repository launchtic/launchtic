// Organization-level helpers. The Organization is the billing entity that
// holds plan + license. On self-host there is exactly one Organization per
// instance (founder owns it); each Workspace belongs to it.
//
// Permission checks read plan via the workspace's Organization — NOT via the
// logged-in user — so a team member invited into an Agency workspace sees
// Agency-tier features even if they have no Organization of their own.

import { db } from "./index";

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
 * AGENCY SUBSCRIPTION MODEL: `licenseExpiresAt` is informational only — this
 * function does not compare it locally. Enforcement happens via
 * `reVerifyIfStale` (lib/license.ts), which periodically re-checks the
 * subscription against the license server and nulls `plan` out the moment the
 * server reports it lapsed/cancelled.
 *
 * Returns `null` when there is no active Agency subscription (never
 * subscribed, cancelled, or revoked) — `getPlanFeatures(null)` resolves that
 * to the FREE tier, not a locked state.
 */
export function getEffectivePlan(organization: {
  plan: string | null;
  licenseExpiresAt?: Date | null;
} | null | undefined): string | null {
  return organization?.plan ?? null;
}
