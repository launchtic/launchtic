import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { db } from "@launchtic/database";
import { ok, err } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";
import { getDriver, getDriverName, buildKey, assetDisplayName } from "../../../../lib/storage";
import { processUploadedImage } from "../../../../lib/media/process-image";
import { storeThumbnail } from "../../../../lib/media/thumbnails";

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"];

export async function POST(req: NextRequest) {
  try {
    const r = await requireAccess("media:upload");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) return err("No file provided", 400);
    if (!ALLOWED_TYPES.includes(file.type)) return err("File type not allowed", 400);
    if (file.size > MAX_SIZE) return err("File too large (max 10 MB)", 400);

    const rawBuffer = Buffer.from(await file.arrayBuffer());

    // Resize, strip EXIF, recompress. SVG / GIF pass through unchanged.
    // optimize=false keeps the uploaded bytes as-is (default: optimize).
    const optimize = formData.get("optimize") !== "false";
    const processed = await processUploadedImage(rawBuffer, file.type, optimize);

    // Dedup: if an Asset with the same content hash already exists in this
    // workspace, reuse it. Saves storage + bandwidth + lets the editor
    // converge two "different uploads of the same file" onto one asset id.
    const sha256 = createHash("sha256").update(processed.buffer).digest("hex");
    const existing = await db.asset.findFirst({
      where: { workspaceId, sha256 },
      select: { id: true, storagePath: true, url: true, bytes: true, width: true, height: true },
    });
    if (existing) {
      return ok({
        url:       existing.url,
        key:       existing.storagePath,
        assetId:   existing.id,
        width:     existing.width,
        height:    existing.height,
        bytesIn:   processed.bytesIn,
        bytesOut:  existing.bytes,
        deduped:   true,
      });
    }

    // Resolve driver name from the org-level storage config so we can persist
    // which driver wrote the file. Needed for mixed-storage workspaces
    // (some assets on local, some on s3) — migration tools must read with
    // the right driver.
    const driverName = await getDriverName(workspaceId);

    const key = buildKey(workspaceId, file.name);
    const driver = await getDriver(workspaceId);
    const url = await driver.upload(key, processed.buffer, processed.mimeType);
    // Best-effort: on failure the listing backfills it later.
    const thumbUrl = await storeThumbnail(driver, key, processed.buffer, processed.mimeType, url)
      .catch(() => null);

    const asset = await db.asset.create({
      data: {
        workspaceId,
        filename:    assetDisplayName(file.name, key),
        mimeType:    processed.mimeType,
        sha256,
        bytes:       processed.bytesOut,
        width:       processed.width,
        height:      processed.height,
        storagePath: key,
        url,
        thumbUrl,
        driver:      driverName,
      },
      select: { id: true },
    });

    return ok({
      url,
      key,
      assetId:  asset.id,
      width:    processed.width,
      height:   processed.height,
      bytesIn:  processed.bytesIn,
      bytesOut: processed.bytesOut,
    });
  } catch (error) {
    console.error("Media upload error:", error);
    return err("Upload failed", 500);
  }
}
