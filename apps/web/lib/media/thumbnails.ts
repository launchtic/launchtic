import { db } from "@launchtic/database";
import { thumbKey, type StorageDriver } from "../storage";
import { makeThumbnail } from "./process-image";

/**
 * Write the grid thumbnail for a stored file and return the URL the grid should
 * load. That is the original URL when no thumbnail is needed (SVG, small files),
 * so `thumbUrl` is only ever null for assets not processed yet.
 */
export async function storeThumbnail(
  driver: StorageDriver,
  key: string,
  buffer: Buffer,
  mimeType: string,
  url: string,
): Promise<string> {
  const thumb = await makeThumbnail(buffer, mimeType);
  if (!thumb) return url;
  return driver.upload(thumbKey(key), thumb, "image/webp");
}

type ThumbAsset = { id: string; storagePath: string; mimeType: string; url: string; thumbUrl: string | null };

/**
 * Backfill thumbnails for assets created before thumbnails existed (or by
 * clone/import). Processes at most `max` assets so a list request stays fast;
 * the rest fill in on later requests. Failures are skipped (grid falls back to
 * the original). Returns assetId → thumbUrl for what it generated.
 */
export async function ensureThumbnails(
  driver: StorageDriver,
  assets: ThumbAsset[],
  max = 48,
): Promise<Map<string, string>> {
  const todo = assets.filter((a) => !a.thumbUrl).slice(0, max);
  const done = new Map<string, string>();
  const CONCURRENCY = 4;
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    await Promise.all(todo.slice(i, i + CONCURRENCY).map(async (a) => {
      try {
        const buffer = await driver.read(a.storagePath);
        const thumbUrl = await storeThumbnail(driver, a.storagePath, buffer, a.mimeType, a.url);
        await db.asset.update({ where: { id: a.id }, data: { thumbUrl } });
        done.set(a.id, thumbUrl);
      } catch (e) {
        console.warn(`Thumbnail failed for ${a.storagePath}:`, (e as Error).message);
      }
    }));
  }
  return done;
}
