import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { ok, err } from "../../../lib/api";
import { requireAccess } from "../../../lib/permissions";
import { getDriver } from "../../../lib/storage";

export async function GET(req: NextRequest) {
  try {
    const r = await requireAccess("media:upload");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { searchParams } = new URL(req.url);
    const folder = searchParams.get("folder") ?? null;
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);
    const continuationToken = searchParams.get("continuation_token") ?? undefined;

    const prefix = folder ? `${workspaceId}/${folder}` : workspaceId;
    const driver = await getDriver(workspaceId);

    const [result, folders] = await Promise.all([
      driver.list(prefix, limit, continuationToken),
      folder ? Promise.resolve([]) : driver.listFolders(workspaceId),
    ]);

    // Enrich each file with its Asset row (assetId) when one exists.
    // Files uploaded via the older flow without an Asset row come back with
    // assetId: null — caller can still display/use them via url.
    const storagePaths = result.files.map((f) => f.key);
    const assets = storagePaths.length > 0
      ? await db.asset.findMany({
          where:  { workspaceId, storagePath: { in: storagePaths } },
          select: { id: true, storagePath: true },
        })
      : [];
    const pathToId = new Map(assets.map((a) => [a.storagePath, a.id]));

    const files = result.files.map((f) => ({
      ...f,
      assetId: pathToId.get(f.key) ?? null,
    }));

    return ok({
      files,
      hasMore:   result.hasMore,
      nextToken: result.nextToken,
      total:     result.total,
      folders,
    });
  } catch (error) {
    console.error("Media list error:", error);
    return err("Failed to list files", 500);
  }
}
