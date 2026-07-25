// Version + update-availability for this self-hosted instance.
//
// current: the image tag this container was deployed with. install.sh / update.sh
//   pin it into the VPS .env as LAUNCHTIC_VERSION; docker-compose passes it into
//   the web container. Unset in local dev → "dev".
// latest:  the current release-channel value from launchtic.com /api/version.
//   Cached per-process (1h) behind a short timeout so a slow/unreachable server
//   never blocks the settings page.
//
// Updates are free for every instance, Free or Agency — no license/entitlement
// check here.

const LICENSE_SERVER_URL = process.env.LICENSE_SERVER_URL ?? "https://launchtic.com";

// YYYY.MM.DD, optionally with a same-day -N suffix (matches build.yml tags).
const DATE_TAG = /^\d{4}\.\d{2}\.\d{2}(-\d+)?$/;

export type VersionInfo = {
  current: string;                       // "2026.06.13" | "stable" | "dev"
  latest: string | null;                 // null = couldn't reach the server
  updateAvailable: boolean;              // newer release exists AND it's installable
  channel: "dated" | "rolling" | "dev";  // how `current` is pinned
};

let cached: { latest: string; stamp: number } | null = null;
const TTL_MS = 60 * 60 * 1000; // 1h

export function getCurrentVersion(): string {
  const v = process.env.LAUNCHTIC_VERSION?.trim();
  return v && v.length > 0 ? v : "dev";
}

// Drop the cached latest version so the next read re-fetches launchtic.com.
// The manual license refresh calls this so one click pulls plan + latest.
export function invalidateVersionCache() {
  cached = null;
}

async function getLatestVersion(): Promise<string | null> {
  const now = Date.now();
  if (cached && now - cached.stamp < TTL_MS) return cached.latest;
  try {
    const res = await fetch(`${LICENSE_SERVER_URL}/api/version`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return cached?.latest ?? null;
    const data = await res.json();
    const latest = typeof data?.version === "string" ? data.version : null;
    if (latest) cached = { latest, stamp: now };
    return latest;
  } catch {
    // Graceful: keep the last known value if we have one, else signal "unknown".
    return cached?.latest ?? null;
  }
}

export async function getVersionInfo(): Promise<VersionInfo> {
  const current = getCurrentVersion();
  const latest = await getLatestVersion();

  const channel: VersionInfo["channel"] =
    current === "dev" ? "dev" : DATE_TAG.test(current) ? "dated" : "rolling";

  // A confident, dated comparison is the only way we know a newer build exists.
  // Rolling tags (stable/latest) and dev builds carry no date to compare — the
  // operator just re-runs the updater. YYYY.MM.DD is zero-padded so a
  // lexicographic compare equals a date compare.
  const newerExists =
    channel === "dated" &&
    latest != null &&
    DATE_TAG.test(latest) &&
    latest > current;

  return { current, latest, channel, updateAvailable: newerExists };
}
