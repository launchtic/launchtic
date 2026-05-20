import { db } from "@launchtic/database";

const VERIFY_INTERVAL_MS = 24 * 60 * 60 * 1000;     // re-verify every 24h
const GRACE_PERIOD_MS    =  7 * 24 * 60 * 60 * 1000; // allow 7 days if server unreachable

export type VerifyResult =
  | { valid: true;  plan: string; expiresAt?: string }
  | { valid: false; error?: string; reachable: boolean };

/**
 * Call the license server. Sends instanceId so the server can detect key sharing
 * (one key activated on multiple installations).
 */
export async function verifyLicenseKey(
  key: string,
  instanceId: string,
): Promise<VerifyResult> {
  const serverUrl = process.env.LICENSE_SERVER_URL ?? "https://launchtic.com";
  try {
    const res = await fetch(`${serverUrl}/api/licenses/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, instanceId }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = await res.json();
    if (data.valid) return { valid: true, plan: data.plan, expiresAt: data.expiresAt };
    return { valid: false, error: data.error, reachable: true };
  } catch {
    return { valid: false, error: "Could not reach license server. Please try again.", reachable: false };
  }
}

/**
 * Called on every dashboard page load.
 * - No-op if verified within the last 24h.
 * - Calls license server if stale → downgrades immediately on revoke.
 * - Grace period of 7 days if server is unreachable.
 */
export async function reVerifyIfStale(userId: string): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      plan:              true,
      licenseKey:        true,
      licenseExpiresAt:  true,
      licenseVerifiedAt: true,
      instanceId:        true,
    },
  });

  // Nothing to verify for FREE users or users without a key.
  if (!user?.licenseKey || user.plan === "COMMUNITY") return;

  const now         = Date.now();
  const lastVerified = user.licenseVerifiedAt?.getTime() ?? 0;

  // Still fresh — skip.
  if (now - lastVerified < VERIFY_INTERVAL_MS) return;

  const result = await verifyLicenseKey(user.licenseKey, user.instanceId ?? userId);

  if (result.valid) {
    // Update plan (may have changed, e.g. STARTER → AGENCY upgrade) + reset timer.
    await db.user.update({
      where: { id: userId },
      data: { plan: result.plan as any, licenseVerifiedAt: new Date() },
    });
    return;
  }

  if (result.reachable) {
    // Server responded: key is invalid or revoked → downgrade immediately.
    await db.user.update({
      where: { id: userId },
      data: { plan: "COMMUNITY", licenseKey: null, licenseVerifiedAt: new Date() },
    });
    return;
  }

  // Server unreachable — check grace period.
  if (now - lastVerified > GRACE_PERIOD_MS) {
    await db.user.update({
      where: { id: userId },
      data: { plan: "COMMUNITY" },
    });
  }
  // else: keep current plan and try again next page load.
}
