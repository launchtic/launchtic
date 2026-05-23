// Helper used by template bundle export endpoints. Given workspace content
// (pageJson tree and/or htmlBody string), find every asset referenced and
// load its raw bytes for inclusion in a .ltbundle.
//
// Resolves assets via two paths:
//   1. Tracked   — match content URL/id against an Asset row (preferred)
//   2. Orphaned  — URL points at this workspace's local /uploads/{wsId}/...
//                  but has no Asset row (legacy upload pre-dating the Asset
//                  model). We read the file directly and synthesize an entry
//                  so bundle export still works for content created before
//                  the migration.

import { createHash } from "crypto";
import { readFile } from "fs/promises";
import { join } from "path";
import { db } from "@launchtic/database";

export interface ExportableAsset {
  filename:    string;
  mimeType:    string;
  sha256:      string;
  width?:      number | null;
  height?:     number | null;
  originalUrl: string;   // ← key consumer uses to rewrite content references
  data:        Buffer;
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg",
  png: "image/png", webp: "image/webp", gif: "image/gif",
  svg: "image/svg+xml",
};

function mimeFromFilename(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

// Strip a leading UUID v4 (with trailing dash) the local-driver buildKey
// prepended at upload time. Without this, the orphan path bubbles the
// source-side UUID up into the bundle, and the consumer would prepend
// its own UUID on import → nested UUIDs in the filename.
const LEADING_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;
function cleanFilenameFromUrl(url: string): string {
  const last = url.split("/").pop() ?? "asset";
  return last.replace(LEADING_UUID_RE, "");
}

export async function collectExportableAssets(
  workspaceId: string,
  contents: Array<unknown | string>,
): Promise<ExportableAsset[]> {
  // Stringify everything once. Cheap O(total bytes) substring search beats
  // walking deeply nested trees and dealing with assetId vs url variants.
  const haystack = contents
    .map((c) => (typeof c === "string" ? c : JSON.stringify(c ?? "")))
    .join("\n");

  // ── 1. Tracked assets ─────────────────────────────────────────────────────
  const allAssets = await db.asset.findMany({ where: { workspaceId } });
  const tracked = allAssets.filter(
    (a) => haystack.includes(a.url) || haystack.includes(a.id),
  );

  const out: ExportableAsset[] = [];
  for (const a of tracked) {
    let data: Buffer;
    try {
      if (a.driver === "local") {
        data = await readFile(join(process.cwd(), "public", "uploads", a.storagePath));
      } else {
        const res = await fetch(a.url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = Buffer.from(await res.arrayBuffer());
      }
    } catch (e: any) {
      console.warn(`[asset-export] skipping tracked asset ${a.id} (${a.filename}):`, e?.message ?? e);
      continue;
    }
    const got = createHash("sha256").update(data).digest("hex");
    if (got !== a.sha256) {
      console.warn(`[asset-export] sha256 drift for ${a.id}: db=${a.sha256} disk=${got}`);
    }
    out.push({
      filename:    a.filename,
      mimeType:    a.mimeType,
      sha256:      a.sha256,
      width:       a.width,
      height:      a.height,
      originalUrl: a.url,
      data,
    });
  }

  // ── 2. Orphan URLs (legacy uploads with no Asset row) ─────────────────────
  // Match the local-driver URL pattern for THIS workspace. Anything outside
  // /uploads/{wsId}/... is either an external CDN URL (don't bundle) or
  // belongs to a different workspace (won't be readable here anyway).
  const bundledUrls = new Set(out.map((a) => a.originalUrl));
  const pattern = new RegExp(`/uploads/${workspaceId}/[\\w/\\-.]+\\.(?:jpe?g|png|webp|gif|svg)`, "gi");
  const orphanUrls = [...new Set(haystack.match(pattern) ?? [])]
    .filter((u) => !bundledUrls.has(u));

  for (const url of orphanUrls) {
    const storagePath = url.replace(/^\/uploads\//, "");
    const fullPath = join(process.cwd(), "public", "uploads", storagePath);
    let data: Buffer;
    try {
      data = await readFile(fullPath);
    } catch (e: any) {
      console.warn(`[asset-export] orphan ${url} not on disk:`, e?.message ?? e);
      continue;
    }
    const filename = cleanFilenameFromUrl(url);
    out.push({
      filename,
      mimeType:    mimeFromFilename(filename),
      sha256:      createHash("sha256").update(data).digest("hex"),
      width:       null,
      height:      null,
      originalUrl: url,
      data,
    });
  }

  console.log(`[asset-export] workspace=${workspaceId} tracked=${tracked.length} orphans=${orphanUrls.length} bundled=${out.length}`);
  return out;
}
