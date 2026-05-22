// "Powered by Launchtic" badge gating — mirrors the rule used by the
// published-page renderer (apps/renderer/lib/page-loader.ts): badge appears
// when the workspace's Organization is on the COMMUNITY plan OR its license
// has expired. STARTER / AGENCY / CUSTOM tiers remove the badge.
//
// Pure function — no DB dependency — so it can be reused from worker queues,
// web API routes, and anywhere else that needs the same rule. The caller is
// responsible for querying workspace.organization.{plan, licenseExpiresAt}.

export function shouldShowLaunchticBadge(
  plan: string | null | undefined,
  licenseExpiresAt: Date | null | undefined,
): boolean {
  const isLicenseActive =
    plan !== "COMMUNITY" &&
    plan != null &&
    (licenseExpiresAt == null || licenseExpiresAt > new Date());
  return !isLicenseActive;
}
