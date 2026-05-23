// Launchtic Template Bundle (.ltbundle) — custom binary format for
// portable template export/import. Opaque to a casual inspector (random
// bytes), but the spec is public so any launchtic instance can decode
// without a shared secret. Community-shareable.
//
// File layout:
//   ┌─────────────────────────────┐
//   │ Magic         4B  "LTB1"    │
//   │ Version       1B  0x01      │
//   │ Manifest len  4B  uint32 LE │
//   ├─────────────────────────────┤
//   │ Manifest      N B gzip(JSON)│  ← metadata + asset index
//   ├─────────────────────────────┤
//   │ Asset blob    rest          │  ← concatenated raw bytes
//   │   [a0 bytes][a1 bytes]...   │
//   └─────────────────────────────┘
//
// Reader walks the manifest's asset index and slices blob[offset:offset+bytes].

import { gzipSync, gunzipSync } from "zlib";

const MAGIC      = Buffer.from("LTB1", "ascii");
const VERSION    = 0x01;
const HEADER_LEN = 4 /* magic */ + 1 /* version */ + 4 /* manifest len */;

export type BundleKind = "page" | "email" | "funnel";

/** Asset entry in the encoded manifest. */
export interface BundleAssetEntry {
  filename: string;
  mimeType: string;
  sha256:   string;
  width?:   number | null;
  height?:  number | null;
  /** Original URL the source instance used in pageJson/htmlBody. The import
   *  flow uses this as the lookup key to rewrite content references. */
  originalUrl: string;
  /** Byte offset into the asset blob (computed at encode time). */
  offset:   number;
  /** Byte length in the asset blob. */
  bytes:    number;
}

export interface BundleManifest {
  /** Bundle format version — for forward compatibility. */
  version:   number;
  kind:      BundleKind;
  /** Free-form template payload — shape depends on `kind`. Consumer-defined.
   *  Typically: { name, type, pageJson, meta, ... } for "page";
   *  { name, subject, htmlBody, ... } for "email";
   *  { name, currency, steps, ... } for "funnel". */
  template:  Record<string, unknown>;
  assets:    BundleAssetEntry[];
  /** When the bundle was exported (ISO 8601). Useful for diagnostics. */
  exportedAt: string;
}

/** Input shape for encoding — each asset carries the raw bytes that will go
 *  into the blob. `offset` is computed by the encoder. */
export interface BundleEncodeInput {
  kind:     BundleKind;
  template: Record<string, unknown>;
  assets:   Array<Omit<BundleAssetEntry, "offset" | "bytes"> & { data: Buffer }>;
}

export function encodeBundle(input: BundleEncodeInput): Buffer {
  // Lay out the asset blob and compute offsets.
  let offset = 0;
  const blobChunks: Buffer[] = [];
  const indexed: BundleAssetEntry[] = input.assets.map((a) => {
    const entry: BundleAssetEntry = {
      filename:    a.filename,
      mimeType:    a.mimeType,
      sha256:      a.sha256,
      width:       a.width  ?? null,
      height:      a.height ?? null,
      originalUrl: a.originalUrl,
      offset,
      bytes:       a.data.length,
    };
    blobChunks.push(a.data);
    offset += a.data.length;
    return entry;
  });

  const manifest: BundleManifest = {
    version:    VERSION,
    kind:       input.kind,
    template:   input.template,
    assets:     indexed,
    exportedAt: new Date().toISOString(),
  };

  const compressedManifest = gzipSync(Buffer.from(JSON.stringify(manifest), "utf8"));

  const header = Buffer.alloc(HEADER_LEN);
  MAGIC.copy(header, 0);
  header.writeUInt8(VERSION, 4);
  header.writeUInt32LE(compressedManifest.length, 5);

  return Buffer.concat([header, compressedManifest, ...blobChunks]);
}

export interface DecodedBundle {
  manifest: BundleManifest;
  /** Slice raw bytes of the asset at `index` out of the blob. */
  getAsset: (index: number) => Buffer;
}

export function decodeBundle(buf: Buffer): DecodedBundle {
  if (buf.length < HEADER_LEN) {
    throw new Error("Bundle too small to contain a header");
  }
  if (!buf.slice(0, 4).equals(MAGIC)) {
    throw new Error("Not a launchtic bundle (bad magic)");
  }
  const version = buf.readUInt8(4);
  if (version !== VERSION) {
    throw new Error(`Unsupported bundle version: ${version} (expected ${VERSION})`);
  }
  const manifestLen   = buf.readUInt32LE(5);
  const manifestStart = HEADER_LEN;
  const manifestEnd   = manifestStart + manifestLen;
  if (buf.length < manifestEnd) {
    throw new Error("Truncated bundle (manifest extends past end)");
  }

  let manifest: BundleManifest;
  try {
    const json = gunzipSync(buf.slice(manifestStart, manifestEnd)).toString("utf8");
    manifest = JSON.parse(json);
  } catch (e: any) {
    throw new Error(`Corrupt manifest: ${e?.message ?? e}`);
  }

  const blobStart = manifestEnd;
  function getAsset(index: number): Buffer {
    const a = manifest.assets[index];
    if (!a) throw new Error(`Asset index ${index} out of range`);
    const start = blobStart + a.offset;
    const end   = start + a.bytes;
    if (end > buf.length) throw new Error(`Asset ${index} extends past bundle end`);
    return buf.slice(start, end);
  }

  return { manifest, getAsset };
}
