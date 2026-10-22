import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";
import { demoGuard } from "../../../../lib/demo";
import { importBundle } from "../../../../lib/template-import";
import { downloadProductFile, markInstalled, instanceIdFor } from "../../../../lib/products";

export const dynamic = "force-dynamic";

// POST /api/purchases/install { key, file } — download one bundle from the
// license server and import it into the current workspace. The client loops
// over files so each gets its own result (and progress shows per file).
export async function POST(req: NextRequest) {
  try {
    const blocked = demoGuard();
    if (blocked) return blocked;
    const r = await requireAccess();
    if (!r.ok) return r.response;
    if (!r.isOwner) return err("Owner-only", 403);

    const { key, file } = await req.json().catch(() => ({}));
    if (typeof key !== "string" || typeof file !== "string") return err("key and file are required", 400);

    // Only keys saved on this organization can be used to install.
    const org = await db.organization.findUnique({
      where: { id: r.organizationId },
      select: { productKeys: true },
    });
    if (!org?.productKeys.includes(key)) return err("Unknown product key", 404);

    const instanceId = await instanceIdFor(r.organizationId);
    try {
      const buf = await downloadProductFile(key, file, instanceId);
      const result = await importBundle(r.workspaceId, buf);
      // Only counted as installed once the import succeeded. If this report
      // fails the template still exists; the file just shows as not installed.
      await markInstalled(key, file, instanceId).catch((e) => console.warn("[purchases] markInstalled failed:", e?.message));
      return ok(result);
    } catch (e: any) {
      return err(e?.message ?? "Install failed", 400);
    }
  } catch (error) {
    return handleError(error);
  }
}
