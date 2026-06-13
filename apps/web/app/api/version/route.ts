import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../lib/api";
import { requireAccess } from "../../../lib/permissions";
import { getVersionInfo } from "../../../lib/version";

export const dynamic = "force-dynamic";

// GET /api/version — this instance's version + whether a newer release exists.
// Owner-only, matching Settings → License: it's operator-level info and only the
// owner can act on it (by running the updater on the host).
export async function GET() {
  try {
    const r = await requireAccess();
    if (!r.ok) return r.response;
    if (!r.isOwner) return err("Owner-only", 403);

    // Free-update window state — a newer build can't be pulled once it lapses,
    // so the UI must offer "renew" instead of "update". Same rule as
    // /api/license: null expiry = perpetual updates.
    const org = await db.organization.findUnique({
      where: { id: r.organizationId },
      select: { licenseExpiresAt: true },
    });
    const updatesCurrent =
      org?.licenseExpiresAt == null || org.licenseExpiresAt >= new Date();

    const info = await getVersionInfo(updatesCurrent);
    return ok({
      ...info,
      // The app can't replace its own container — the operator runs this over
      // SSH on the host. The dir matches install.sh's default INSTALL_DIR.
      updateCommand: "cd launchtic && curl -fsSL https://launchtic.com/update | bash",
    });
  } catch (error) {
    return handleError(error);
  }
}
