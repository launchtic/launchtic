import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { ok, err } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";

const bodySchema = z.object({ assetId: z.string().min(1), pinned: z.boolean() });

// Toggle whether an asset is pinned to the top of the Media Library. Pins are
// per-workspace (shared by the whole team).
export async function POST(req: NextRequest) {
  try {
    const r = await requireAccess("media:upload");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { assetId, pinned } = bodySchema.parse(await req.json());

    // updateMany scoped to workspaceId — one workspace can't pin another's asset.
    const result = await db.asset.updateMany({
      where: { id: assetId, workspaceId },
      data:  { pinned },
    });
    if (result.count === 0) return err("Asset not found", 404);

    return ok({ assetId, pinned });
  } catch (error) {
    console.error("Media pin error:", error);
    return err("Failed to update pin", 500);
  }
}
