import { ok, err, handleError } from "../../../lib/api";
import { requireAccess } from "../../../lib/permissions";
import { getVersionInfo } from "../../../lib/version";

export const dynamic = "force-dynamic";

// GET /api/version — this instance's version + whether a newer release exists.
// Owner-only, matching Settings → License: it's operator-level info and only the
// owner can act on it (by running the updater on the host). Updates are free
// for every instance — no license check here.
export async function GET() {
  try {
    const r = await requireAccess();
    if (!r.ok) return r.response;
    if (!r.isOwner) return err("Owner-only", 403);

    const info = await getVersionInfo();
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
