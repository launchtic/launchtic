import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";
import { verifyLicenseKey } from "../../../../lib/license";
import { invalidateVersionCache } from "../../../../lib/version";

export const dynamic = "force-dynamic";

// POST /api/license/refresh — force an immediate license re-verify against
// launchtic.com, bypassing the 24h staleness gate in reVerifyIfStale. Lets an
// owner pull a fresh plan right after subscribing to/cancelling Agency on
// launchtic.com instead of waiting up to a day for the automatic re-check.
export async function POST() {
  try {
    const r = await requireAccess();
    if (!r.ok) return r.response;
    if (!r.isOwner) return err("Owner-only", 403);

    const org = await db.organization.findUnique({
      where: { id: r.organizationId },
      select: { licenseKey: true, instanceId: true },
    });
    if (!org?.licenseKey) return err("No license to refresh", 400);

    const result = await verifyLicenseKey(org.licenseKey, org.instanceId ?? r.organizationId);

    if (!result.valid) {
      // Server reachable + said invalid/revoked → lock now. Unreachable → leave
      // state as-is and let the owner retry.
      if (result.reachable) {
        await db.organization.update({
          where: { id: r.organizationId },
          data: { plan: null, licenseKey: null, licenseVerifiedAt: new Date() },
        });
        return err(result.error ?? "License is no longer valid.", 400);
      }
      return err("Couldn't reach the license server. Try again.", 503);
    }

    await db.organization.update({
      where: { id: r.organizationId },
      data: {
        plan: result.plan as any,
        licenseExpiresAt: result.expiresAt ? new Date(result.expiresAt) : null,
        licenseVerifiedAt: new Date(),
      },
    });

    // Bust the cached latest version so the same refresh also pulls a freshly
    // bumped release tag from launchtic.com (no waiting on the 1h cache).
    invalidateVersionCache();

    return ok({ plan: result.plan, expiresAt: result.expiresAt ?? null });
  } catch (error) {
    return handleError(error);
  }
}
