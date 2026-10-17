import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { ok, err } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";
import { getDriver, thumbKey } from "../../../../lib/storage";

const bodySchema = z.object({ key: z.string().min(1) });

export async function POST(req: NextRequest) {
  try {
    const r = await requireAccess("media:upload");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { key } = bodySchema.parse(await req.json());

    // Ensure the key belongs to this workspace
    if (!key.startsWith(`${workspaceId}/`)) return err("Forbidden", 403);

    const driver = await getDriver(workspaceId);
    await driver.delete(key);
    await driver.delete(thumbKey(key)).catch(() => {});   // may not exist

    // Also drop the Asset row tracking this file. Idempotent — works whether
    // the row existed (modern uploads) or didn't (legacy uploads pre-Asset).
    // NOTE: this leaves any pageJson/htmlBody that referenced the asset with
    // dangling URLs / assetIds — orphan cleanup of content refs is a separate
    // job (see "Asset cleanup khi xoá content" task).
    const removed = await db.asset.deleteMany({
      where: { workspaceId, storagePath: key },
    });

    return ok({ deleted: key, assetRowsRemoved: removed.count });
  } catch (error) {
    console.error("Media delete error:", error);
    return err("Delete failed", 500);
  }
}
