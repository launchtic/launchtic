import sharp from "sharp";

const MAX_WIDTH = 2000;
const JPEG_QUALITY = 85;
const WEBP_QUALITY = 85;

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
 *  - JPEG q=85 mozjpeg / PNG lossless level 9 / WebP q=85.
 *  - Keep the source format — caller needs JPEG fallback for older browsers.
 *
 * SVG and GIF are passed through unchanged (vector / animated).
 */
export async function processUploadedImage(
  rawBuffer: Buffer,
  mimeType: string
): Promise<ProcessResult> {
  const bytesIn = rawBuffer.byteLength;

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
    // Photo-like PNGs (e.g. DALL·E output, screenshots) compress poorly
    // with lossless level 9 — usually <5% reduction. Switch to palette
    // quantisation (libimagequant) for ~70-80% reduction while keeping
    // alpha and PNG format. `quality: 85` is the sweet spot; `effort: 7`
    // spends a bit more CPU finding an optimal palette.
    pipeline = pipeline.png({
      compressionLevel: 9,
      adaptiveFiltering: true,
      palette: true,
      quality: 85,
      effort: 7,
    });
  } else {
    pipeline = pipeline.webp({ quality: WEBP_QUALITY });
  }

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

  return {
    buffer: data,
    mimeType,
    width: info.width,
    height: info.height,
    bytesIn,
    bytesOut: data.byteLength,
  };
}
