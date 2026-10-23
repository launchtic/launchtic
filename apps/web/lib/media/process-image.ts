import sharp, { type Metadata } from "sharp";

// Full-HD width. Users needing more uncheck "Optimize" and keep the original.
const MAX_WIDTH = 1920;
const JPEG_QUALITY = 80;
const WEBP_QUALITY = 80;

export type ProcessResult = {
  buffer: Buffer;
  mimeType: string;
  width?: number;
  height?: number;
  bytesIn: number;
  bytesOut: number;
};

/**
 * Optimize an uploaded image:
 *  - Auto-rotate by EXIF orientation, then strip metadata (privacy + size).
 *  - Resize down to MAX_WIDTH (no upscaling).
 *  - JPEG q=80 mozjpeg / PNG lossless level 9 / WebP q=80.
 *    PNG stays lossless: palette quantisation banded gradients and soft
 *    alpha edges (AI images, product mockups) — PNG uploads are usually
 *    exactly the images where that shows.
 *  - Keep the source format — caller needs JPEG fallback for older browsers.
 *
 * SVG and GIF are passed through unchanged (vector / animated), as is every
 * file when `optimize` is false (user unchecked "Optimize uploaded images").
 */
export async function processUploadedImage(
  rawBuffer: Buffer,
  mimeType: string,
  optimize = true,
): Promise<ProcessResult> {
  const bytesIn = rawBuffer.byteLength;

  if (!optimize) {
    const meta: Partial<Metadata> = mimeType === "image/svg+xml"
      ? {}
      : await sharp(rawBuffer, { failOn: "none" }).metadata().catch(() => ({} as Metadata));
    return { buffer: rawBuffer, mimeType, width: meta.width, height: meta.height, bytesIn, bytesOut: bytesIn };
  }

  if (mimeType === "image/svg+xml" || mimeType === "image/gif") {
    return { buffer: rawBuffer, mimeType, bytesIn, bytesOut: bytesIn };
  }

  if (
    mimeType !== "image/jpeg" &&
    mimeType !== "image/png" &&
    mimeType !== "image/webp"
  ) {
    return { buffer: rawBuffer, mimeType, bytesIn, bytesOut: bytesIn };
  }

  let pipeline = sharp(rawBuffer, { failOn: "none" })
    .rotate()
    .resize({ width: MAX_WIDTH, withoutEnlargement: true });

  if (mimeType === "image/jpeg") {
    pipeline = pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true });
  } else if (mimeType === "image/png") {
    pipeline = pipeline.png({ compressionLevel: 9, adaptiveFiltering: true });
  } else {
    pipeline = pipeline.webp({ quality: WEBP_QUALITY });
  }

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

  // Lossless re-encoding can't beat an already well-compressed PNG and often
  // grows it. When nothing was resized, keep the uploaded bytes instead.
  if (mimeType === "image/png" && data.byteLength >= bytesIn) {
    const meta = await sharp(rawBuffer, { failOn: "none" }).metadata();
    if (meta.width === info.width) {
      return { buffer: rawBuffer, mimeType, width: meta.width, height: meta.height, bytesIn, bytesOut: bytesIn };
    }
  }

  return {
    buffer: data,
    mimeType,
    width: info.width,
    height: info.height,
    bytesIn,
    bytesOut: data.byteLength,
  };
}

const THUMB_EDGE = 240;
// Below this size the original is cheap enough to show in the grid as-is.
const THUMB_MIN_BYTES = 50 * 1024;

/**
 * Small WebP for media-library grids (tiles are ~120×84 CSS px; 240 covers 2x
 * screens). Returns null when the original should be shown instead: SVG
 * (vector, tiny) and images already under THUMB_MIN_BYTES.
 */
export async function makeThumbnail(buffer: Buffer, mimeType: string): Promise<Buffer | null> {
  if (buffer.byteLength < THUMB_MIN_BYTES) return null;
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mimeType)) return null;
  return sharp(buffer, { failOn: "none" })
    .rotate()
    // "outside": the SHORT edge becomes 240, so object-fit: cover tiles stay sharp.
    .resize({ width: THUMB_EDGE, height: THUMB_EDGE, fit: "outside", withoutEnlargement: true })
    .webp({ quality: 75 })
    .toBuffer();
}
