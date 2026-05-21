import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, err } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";
import { getDriver } from "../../../../lib/storage";

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

    return ok({ deleted: key });
  } catch (error) {
    console.error("Media delete error:", error);
    return err("Delete failed", 500);
  }
}
