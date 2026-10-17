import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { ok, err } from "../../../lib/api";
import { requireAccess } from "../../../lib/permissions";
import { getDriver } from "../../../lib/storage";
import { ensureThumbnails } from "../../../lib/media/thumbnails";

// Shape an Asset DB row into the same file object the storage driver returns,
// plus assetId + pinned. Used by search (DB-sourced) and the pinned list.
const assetToFile = (a: {
  id: string; filename: string; url: string; thumbUrl: string | null; bytes: number; storagePath: string; pinned: boolean;
}) => ({
  key: a.storagePath,
  name: a.filename,
  url: a.url,
  thumbUrl: a.thumbUrl,
  size: a.bytes,
  assetId: a.id,
  pinned: a.pinned,
});

const ASSET_FILE_SELECT = {
  id: true, filename: true, url: true, thumbUrl: true, mimeType: true, bytes: true, storagePath: true, pinned: true,
} as const;

// Fill in missing thumbnails for the rows about to be returned, in place.
async function withThumbs<T extends { id: string; storagePath: string; mimeType: string; url: string; thumbUrl: string | null }>(
  driver: Awaited<ReturnType<typeof getDriver>>,
  rows: T[],
): Promise<T[]> {
  const made = await ensureThumbnails(driver, rows);
  return rows.map((r) => (made.has(r.id) ? { ...r, thumbUrl: made.get(r.id)! } : r));
}

export async function GET(req: NextRequest) {
  try {
    const r = await requireAccess("media:upload");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);
    const continuationToken = searchParams.get("continuation_token") ?? undefined;
    const search = searchParams.get("search")?.trim() || "";

    // Pinned assets always travel with the response so the caller can show them
    // first, regardless of which storage page is loaded.
    const driver = await getDriver(workspaceId);
    const pinnedRows = await withThumbs(driver, await db.asset.findMany({
      where:   { workspaceId, pinned: true },
      select:  ASSET_FILE_SELECT,
      orderBy: { createdAt: "desc" },
    }));
    const pinned = pinnedRows.map(assetToFile);

    // ── Search mode: query the whole library from the DB (Asset table), not the
    // paginated storage listing. Only Asset-tracked files are searchable; legacy
    // files without a row are not (they remain browsable when not searching).
    if (search) {
      const rows = await withThumbs(driver, await db.asset.findMany({
        where:   { workspaceId, filename: { contains: search, mode: "insensitive" } },
        select:  ASSET_FILE_SELECT,
        orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
        take:    200,
      }));
      return ok({ files: rows.map(assetToFile), pinned, hasMore: false, nextToken: null, total: rows.length });
    }

    // ── Browse mode: paginated storage listing enriched with assetId + pinned.
    const result = await driver.list(workspaceId, limit, continuationToken);

    const storagePaths = result.files.map((f) => f.key);
    const assets = storagePaths.length > 0
      ? await withThumbs(driver, await db.asset.findMany({
          where:  { workspaceId, storagePath: { in: storagePaths } },
          select: { id: true, storagePath: true, pinned: true, url: true, thumbUrl: true, mimeType: true },
        }))
      : [];
    const pathToAsset = new Map(assets.map((a) => [a.storagePath, a]));

    const files = result.files.map((f) => {
      const a = pathToAsset.get(f.key);
      return { ...f, assetId: a?.id ?? null, pinned: a?.pinned ?? false, thumbUrl: a?.thumbUrl ?? null };
    });

    return ok({
      files,
      pinned,
      hasMore:   result.hasMore,
      nextToken: result.nextToken,
      total:     result.total,
    });
  } catch (error) {
    console.error("Media list error:", error);
    return err("Failed to list files", 500);
  }
}
