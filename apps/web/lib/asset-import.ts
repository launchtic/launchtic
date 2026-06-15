// Asset import helper used by the workspace clone flow. Takes a manifest of
// source-side assets, materializes them in the target workspace's storage
// (dedup by sha256), and returns a map for rewriting content references.

import { createHash } from "crypto";
import { db } from "@launchtic/database";
import { getDriver, getDriverName, buildKey } from "./storage";

export interface AssetManifestEntry {
  /** Source-side asset id (gallery's PublicTemplateAsset.id, or another
   *  workspace's Asset.id). Used as map key for content rewrites. */
  assetId:  string;
  /** Absolute or relative URL that the target instance can fetch the bytes
   *  from. For relative URLs (e.g. `/uploads/...`), pass `baseUrl` so we can
   *  resolve to absolute. */
  url:      string;
  sha256:   string;
  filename: string;
  mimeType: string;
  bytes?:   number;
  width?:   number | null;
  height?:  number | null;
}

export interface AssetRefMap {
  /** Source assetId → target Asset.id. Used to rewrite { assetId } fields. */
  idMap:  Record<string, string>;
  /** Source URL → target URL. Used to rewrite plain url strings (covers
   *  legacy content where assetId wasn't tracked). */
  urlMap: Record<string, string>;
}

/**
 * Materialize each manifest entry in the target workspace. Dedups by
 * (workspaceId, sha256) so re-importing the same template (or importing two
 * templates that share an asset) doesn't duplicate storage.
 *
 * `baseUrl` is the origin of the source (e.g. https://launchtic.com) used to
 * resolve relative URLs in the manifest. Pass undefined when manifest urls
 * are already absolute.
 */
export async function importAssets(
  workspaceId: string,
  manifest: AssetManifestEntry[],
  baseUrl?: string,
): Promise<AssetRefMap> {
  const idMap:  Record<string, string> = {};
  const urlMap: Record<string, string> = {};
  if (!manifest.length) return { idMap, urlMap };

  // Resolve target driver once (org-wide storage config).
  const driverName = await getDriverName(workspaceId);
  const driver     = await getDriver(workspaceId);

  for (const entry of manifest) {
    // Dedup: same sha256 already in this workspace → reuse.
    const existing = await db.asset.findFirst({
      where:  { workspaceId, sha256: entry.sha256 },
      select: { id: true, url: true },
    });
    if (existing) {
      idMap[entry.assetId]  = existing.id;
      urlMap[entry.url]     = existing.url;
      continue;
    }

    // Fetch source bytes. Relative URL → resolve against baseUrl.
    const fetchUrl = /^https?:\/\//i.test(entry.url) ? entry.url : `${baseUrl ?? ""}${entry.url}`;
    let buffer: Buffer;
    try {
      const res = await fetch(fetchUrl, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      buffer = Buffer.from(await res.arrayBuffer());
    } catch (e: any) {
      console.error(`[asset-import] failed to fetch ${fetchUrl}:`, e?.message ?? e);
      continue; // skip — content rewrite will leave original URL in place
    }

    // Sanity-check integrity vs declared sha256. Mismatch → skip (could be
    // CDN cache miss returning HTML error page).
    const got = createHash("sha256").update(buffer).digest("hex");
    if (got !== entry.sha256) {
      console.warn(`[asset-import] sha256 mismatch for ${entry.assetId} — declared ${entry.sha256}, got ${got}. Skipping.`);
      continue;
    }

    // Upload to the workspace's shared media folder (root).
    const key = buildKey(workspaceId, entry.filename);
    const newUrl = await driver.upload(key, buffer, entry.mimeType);

    const created = await db.asset.create({
      data: {
        workspaceId,
        filename:    entry.filename,
        mimeType:    entry.mimeType,
        sha256:      entry.sha256,
        bytes:       entry.bytes ?? buffer.length,
        width:       entry.width  ?? null,
        height:      entry.height ?? null,
        storagePath: key,
        url:         newUrl,
        driver:      driverName,
      },
      select: { id: true },
    });

    idMap[entry.assetId] = created.id;
    urlMap[entry.url]    = newUrl;
  }

  return { idMap, urlMap };
}

/**
 * Deep-clone an arbitrary JSON value and rewrite asset references:
 *  - any object key `assetId` whose value is in idMap → replaced
 *  - any string value matching a key in urlMap → replaced
 *
 * Safe for pageJson trees of any depth. Returns a new value; input untouched.
 */
export function rewriteAssetRefs<T>(input: T, refs: AssetRefMap): T {
  const { idMap, urlMap } = refs;

  function walk(v: unknown): unknown {
    if (typeof v === "string") {
      return urlMap[v] ?? v;
    }
    if (Array.isArray(v)) {
      return v.map(walk);
    }
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, child] of Object.entries(v)) {
        if (k === "assetId" && typeof child === "string" && idMap[child]) {
          out[k] = idMap[child];
        } else {
          out[k] = walk(child);
        }
      }
      return out;
    }
    return v;
  }

  return walk(input) as T;
}

/**
 * Rewrite asset URLs inside an HTML body (email htmlBody). Uses urlMap only —
 * htmlBody is opaque HTML, so we just substring-replace each known source URL
 * with its target URL. Longer URLs first to avoid partial-overlap mishaps.
 */
export function rewriteHtmlAssetUrls(html: string, refs: AssetRefMap): string {
  const entries = Object.entries(refs.urlMap).sort((a, b) => b[0].length - a[0].length);
  let out = html;
  for (const [from, to] of entries) {
    out = out.split(from).join(to);
  }
  return out;
}
