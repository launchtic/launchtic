// "Powered by Launchtic" badge gating — mirrors the rule used by the
// published-page renderer (apps/renderer/lib/page-loader.ts): badge appears
// when the workspace owner is on the FREE plan OR their license has expired.
// PRO/Enterprise are white-label and never display the badge.
//
// Pure function — no DB dependency — so it can be reused from worker queues,
// web API routes, and anywhere else that needs the same rule. The caller is
// responsible for querying owner.plan + owner.licenseExpiresAt.

export function shouldShowLaunchticBadge(
  plan: string | null | undefined,
  licenseExpiresAt: Date | null | undefined,
): boolean {
  const isLicenseActive =
    plan !== "FREE" &&
    plan != null &&
    (licenseExpiresAt == null || licenseExpiresAt > new Date());
  return !isLicenseActive;
}
