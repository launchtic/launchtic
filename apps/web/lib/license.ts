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
 * Re-verify a workspace's Organization license against the license server.
 * Called on every dashboard page load with the workspace's organizationId.
 * - No-op if verified within the last 24h.
 * - Calls license server if stale → downgrades immediately on revoke.
 * - Grace period of 7 days if server is unreachable.
 */
export async function reVerifyIfStale(organizationId: string): Promise<void> {
  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: {
      plan:              true,
      licenseKey:        true,
      licenseExpiresAt:  true,
      licenseVerifiedAt: true,
      instanceId:        true,
    },
  });

  // Nothing to verify for unlicensed orgs (no key / locked).
  if (!organization?.licenseKey || !organization.plan) return;

  const now          = Date.now();
  const lastVerified = organization.licenseVerifiedAt?.getTime() ?? 0;

  // Still fresh — skip.
  if (now - lastVerified < VERIFY_INTERVAL_MS) return;

  const result = await verifyLicenseKey(organization.licenseKey, organization.instanceId ?? organizationId);

  if (result.valid) {
    // Sync plan (may have changed, e.g. AGENCY → CUSTOM upgrade) AND the
    // update window (extended by a renewal) + reset timer. Missing expiresAt
    // here meant renewals never reflected in-app until reinstall.
    await db.organization.update({
      where: { id: organizationId },
      data: {
        plan: result.plan as any,
        licenseExpiresAt: result.expiresAt ? new Date(result.expiresAt) : null,
        licenseVerifiedAt: new Date(),
      },
    });
    return;
  }

  if (result.reachable) {
    // Server responded: key is invalid or revoked → lock immediately.
    await db.organization.update({
      where: { id: organizationId },
      data: { plan: null, licenseKey: null, licenseVerifiedAt: new Date() },
    });
    return;
  }

  // Server unreachable — check grace period.
  if (now - lastVerified > GRACE_PERIOD_MS) {
    await db.organization.update({
      where: { id: organizationId },
      data: { plan: null },
    });
  }
  // else: keep current plan and try again next page load.
}

/**
 * Read LAUNCHTIC_LICENSE + LAUNCHTIC_INSTANCE_ID from the environment (written
 * by install.sh during license-gated install) and activate them on the given
 * Organization. Called once from the first-run wizard (/api/setup/admin) right
 * after the Organization is created — this is the single env-activation point.
 * Idempotent and silent on no-op:
 *
 *   - env missing key or instanceId → return false (nothing to do)
 *   - Organization already has same licenseKey → return true (already done)
 *   - license server says invalid → log + return false (org stays locked; admin
 *     can paste a key manually in Settings → License)
 *   - license server unreachable → log + return false (reVerifyIfStale retries
 *     once the admin browses the dashboard)
 *
 * Returns true iff the Organization was activated (or was already correct).
 */
export async function bootstrapLicenseFromEnv(organizationId: string): Promise<boolean> {
  const envKey        = process.env.LAUNCHTIC_LICENSE;
  const envInstanceId = process.env.LAUNCHTIC_INSTANCE_ID;
  if (!envKey || !envInstanceId) return false;

  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { licenseKey: true, plan: true },
  });
  if (!org) return false;

  // Already activated with the same key → no-op (avoid pointless network call
  // on every container restart).
  if (org.licenseKey === envKey && org.plan != null) return true;

  const result = await verifyLicenseKey(envKey, envInstanceId);

  if (!result.valid) {
    // Leave the org locked (plan null). Admin will see the activation prompt
    // in Settings; preserves user agency without crashing boot.
    console.warn(
      `[license-bootstrap] Could not activate env license: ${result.valid === false ? result.error : "unknown"}`,
    );
    return false;
  }

  await db.organization.update({
    where: { id: organizationId },
    data: {
      licenseKey:        envKey,
      plan:              result.plan as any,
      licenseExpiresAt:  result.expiresAt ? new Date(result.expiresAt) : null,
      licenseVerifiedAt: new Date(),
      instanceId:        envInstanceId,
    },
  });

  console.log(`[license-bootstrap] Activated ${result.plan} license for organization ${organizationId}`);
  return true;
}
