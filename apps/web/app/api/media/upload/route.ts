import { NextRequest } from "next/server";
import { ok, err } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";
import { getDriver, buildKey } from "../../../../lib/storage";
import { processUploadedImage } from "../../../../lib/media/process-image";

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"];

export async function POST(req: NextRequest) {
  try {
    const r = await requireAccess("settings:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) return err("No file provided", 400);
    if (!ALLOWED_TYPES.includes(file.type)) return err("File type not allowed", 400);
    if (file.size > MAX_SIZE) return err("File too large (max 10 MB)", 400);

    const folder = formData.get("folder") as string | null;
    const rawBuffer = Buffer.from(await file.arrayBuffer());

    // Resize, strip EXIF, recompress. SVG / GIF pass through unchanged.
    const processed = await processUploadedImage(rawBuffer, file.type);

    const key = buildKey(workspaceId, file.name, folder ?? undefined);
    const driver = await getDriver(workspaceId);
    const url = await driver.upload(key, processed.buffer, processed.mimeType);

    return ok({
      url,
      key,
      width: processed.width,
      height: processed.height,
      bytesIn: processed.bytesIn,
      bytesOut: processed.bytesOut,
    });
  } catch (error) {
    console.error("Media upload error:", error);
    return err("Upload failed", 500);
  }
}
