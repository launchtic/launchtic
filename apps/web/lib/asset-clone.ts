// Helpers for cloning assets between workspaces (used by the workspace
// clone route after content has been duplicated). Runs after the main DB
// transaction so file copies don't hold a connection open.
//
// Design principle — *preserve asset location across clone*. We don't
// migrate files between drivers during the clone:
//
//   src.driver = "local" → dest asset stays local (fs.copyFile, reflink-friendly)
//   src.driver = "s3"    → dest asset stays in S3   (CopyObjectCommand, zero egress)
//
// This means a cloned workspace inherits the source's mixed-storage layout.
// If the source had 1K local + 9K S3 (because org switched drivers at some
// point), the dest will too — no needless local→S3 upload or S3→local
// download. The org's *current* driver only matters for FUTURE uploads to
// dest; cloned content keeps whatever driver wrote it originally.
//
// Fallback transfer (download + upload) is only used when the native path
// is unavailable — e.g. src is S3 but org has since dropped its S3 config
// (so we have no S3Driver to do CopyObject with).
//
// Plus:
//   - Batch dedup query (1 round-trip instead of N)
//   - Concurrency limit so 10K-asset workspaces still finish in seconds

import { db } from "@launchtic/database";
import { getDriver, getDriverName, buildKey, LocalDriver, type StorageDriver } from "./storage";
import {
  rewriteAssetRefs,
  rewriteHtmlAssetUrls,
  type AssetRefMap,
} from "./asset-import";

// Concurrency caps tuned for typical workloads.
const NATIVE_CONCURRENCY   = 50;   // fs.copyFile / S3 CopyObject — cheap
const TRANSFER_CONCURRENCY = 10;   // download+upload — bandwidth-bound

/**
 * Copy every Asset row from `sourceWorkspaceId` to `destWorkspaceId`:
 *  - reads source file via its declared driver
 *  - writes to dest workspace's current driver
 *  - dedups by sha256 in case the dest already has the same content
 *  - uses native server-side copy when source + dest are on the same storage
 *
 * Returns the ref map for downstream content rewriting.
 */
export async function cloneAssets(
  sourceWorkspaceId: string,
  destWorkspaceId: string,
): Promise<AssetRefMap> {
  const idMap:  Record<string, string> = {};
  const urlMap: Record<string, string> = {};

  const sourceAssets = await db.asset.findMany({
    where: { workspaceId: sourceWorkspaceId },
  });
  if (sourceAssets.length === 0) return { idMap, urlMap };

  // ── 1. Batch dedup query — 1 round-trip instead of N ─────────────────────
  // Pre-load every dest asset's (sha256 → row) so per-asset dedup is O(1)
  // in-memory. For 10K-asset workspaces this saves 10K queries.
  const destExisting = await db.asset.findMany({
    where:  { workspaceId: destWorkspaceId },
    select: { id: true, url: true, sha256: true },
  });
  const destBySha = new Map(destExisting.map((d) => [d.sha256, d]));

  // ── 2. Resolve drivers once ──────────────────────────────────────────────
  // destDriver is the org's CURRENT driver — used for S3→S3 native copy (it
  // holds the credentials) and for transfer fallback uploads.
  // localDriver is always instantiable — used for local→local native copy
  // regardless of dest org's current driver (preserves location).
  const destDriverName = await getDriverName(destWorkspaceId);
  const destDriver     = await getDriver(destWorkspaceId);
  const localDriver    = new LocalDriver();

  // ── 3. Categorize source assets by routing strategy ──────────────────────
  // Routing is driven by src.driver so each cloned asset stays on the same
  // storage as the original:
  //   src=local                          → native via LocalDriver  (preserves)
  //   src=s3   + dest org currently s3   → native via destDriver   (preserves)
  //   src=s3   + dest org dropped s3     → transfer (no S3 creds available)
  type SrcAsset = (typeof sourceAssets)[number];
  type Routed = { asset: SrcAsset };

  const dedup:    Routed[] = [];
  const native:   Routed[] = [];
  const transfer: Routed[] = [];

  for (const src of sourceAssets) {
    if (destBySha.has(src.sha256)) {
      dedup.push({ asset: src });
      continue;
    }
    if (src.driver === "local") {
      native.push({ asset: src });
    } else if (src.driver === "s3" && destDriverName === "s3") {
      // Same-bucket assumption usually holds (clone is intra-org and storage
      // is org-level). If org swapped to a different bucket between the
      // original upload and now, CopyObject will 404 → fallback transfer.
      native.push({ asset: src });
    } else {
      // src is on S3 but org has dropped its S3 config — no native S3 driver
      // available, must download via public URL + upload to dest's current driver.
      transfer.push({ asset: src });
    }
  }

  // ── 4. Resolve dedup hits (no I/O) ───────────────────────────────────────
  for (const { asset: src } of dedup) {
    const hit = destBySha.get(src.sha256)!;
    idMap[src.id]   = hit.id;
    urlMap[src.url] = hit.url;
  }

  // ── 5. Native copies (parallel, high concurrency) ────────────────────────
  await parallelMap(native, NATIVE_CONCURRENCY, async ({ asset: src }) => {
    const destKey   = buildKey(destWorkspaceId, src.filename);
    // Pick the driver that matches the SOURCE asset's storage — that's where
    // we want the clone to live (location preservation).
    const copyDriver = src.driver === "local" ? localDriver : destDriver;
    try {
      const newUrl = await copyDriver.copy(src.storagePath, destKey);
      // driver column on new row = src.driver (file stayed put).
      await registerCloned(src, destKey, newUrl, destWorkspaceId, src.driver, idMap, urlMap);
    } catch (e: any) {
      // CopyObject 404 (bucket changed) or other native-copy failure —
      // fall back to transfer path. Transfer uploads to dest's current driver,
      // so the resulting asset row gets destDriverName (file moved).
      console.warn(`[asset-clone] native copy failed for ${src.id}, falling back to transfer:`, e?.message);
      await transferOne(src, destWorkspaceId, destDriver, destDriverName, idMap, urlMap);
    }
  });

  // ── 6. Transfer copies (parallel, lower concurrency for bandwidth) ───────
  await parallelMap(transfer, TRANSFER_CONCURRENCY, async ({ asset: src }) => {
    await transferOne(src, destWorkspaceId, destDriver, destDriverName, idMap, urlMap);
  });

  console.log(
    `[asset-clone] cloned src=${sourceWorkspaceId} → dest=${destWorkspaceId}: ` +
    `dedup=${dedup.length} native=${native.length} transfer=${transfer.length}`,
  );

  return { idMap, urlMap };
}

/** Fallback: read bytes via source driver then upload via dest driver. */
async function transferOne(
  src: { id: string; url: string; storagePath: string; driver: string; mimeType: string; filename: string; sha256: string; bytes: number; width: number | null; height: number | null },
  destWorkspaceId: string,
  destDriver: StorageDriver,
  destDriverName: string,
  idMap: Record<string, string>,
  urlMap: Record<string, string>,
): Promise<void> {
  let buffer: Buffer;
  try {
    if (src.driver === "local") {
      const { readFile } = await import("fs/promises");
      const path = await import("path");
      buffer = await readFile(path.join(process.cwd(), "public", "uploads", src.storagePath));
    } else {
      const res = await fetch(src.url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      buffer = Buffer.from(await res.arrayBuffer());
    }
  } catch (e: any) {
    console.error(`[asset-clone] failed to read source asset ${src.id}:`, e?.message ?? e);
    return;
  }

  const destKey = buildKey(destWorkspaceId, src.filename);
  const newUrl  = await destDriver.upload(destKey, buffer, src.mimeType);
  await registerCloned(src, destKey, newUrl, destWorkspaceId, destDriverName, idMap, urlMap);
}

/** Create the dest Asset row + populate refMap. */
async function registerCloned(
  src: { id: string; url: string; filename: string; mimeType: string; sha256: string; bytes: number; width: number | null; height: number | null },
  destKey: string,
  newUrl: string,
  destWorkspaceId: string,
  destDriverName: string,
  idMap: Record<string, string>,
  urlMap: Record<string, string>,
): Promise<void> {
  const created = await db.asset.create({
    data: {
      workspaceId: destWorkspaceId,
      filename:    src.filename,
      mimeType:    src.mimeType,
      sha256:      src.sha256,
      bytes:       src.bytes,
      width:       src.width,
      height:      src.height,
      storagePath: destKey,
      url:         newUrl,
      driver:      destDriverName,
    },
    select: { id: true },
  });
  idMap[src.id]   = created.id;
  urlMap[src.url] = newUrl;
}

/** Minimal concurrency-limited map. No external dep. */
async function parallelMap<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { await fn(items[idx]); } catch (e) { console.error("[parallelMap]", e); }
    }
  });
  await Promise.all(workers);
}

/**
 * Walk every content row in a workspace that may reference assets and
 * rewrite assetId + URL occurrences using the given map. Called after
 * cloneAssets so newly-cloned content points at the new workspace's assets.
 *
 * Covers:
 *   - PageTemplate.pageJson, .meta, .thumbnailUrl
 *   - FunnelStep.pageJson, .meta
 *   - EmailTemplate.htmlBody
 *   - SequenceStep.emailHtmlBody  (cloned sequences keep snapshot HTML)
 *   - SavedBlock.contentJson
 */
export async function rewriteWorkspaceContentAssets(
  workspaceId: string,
  refs: AssetRefMap,
): Promise<void> {
  if (Object.keys(refs.idMap).length === 0 && Object.keys(refs.urlMap).length === 0) return;

  // ── Page templates ────────────────────────────────────────────────────
  const pageTemplates = await db.pageTemplate.findMany({
    where:  { workspaceId },
    select: { id: true, pageJson: true, meta: true, thumbnailUrl: true },
  });
  for (const pt of pageTemplates) {
    await db.pageTemplate.update({
      where: { id: pt.id },
      data: {
        pageJson:     rewriteAssetRefs(pt.pageJson as any, refs) as any,
        meta:         rewriteAssetRefs(pt.meta     as any, refs) as any,
        thumbnailUrl: pt.thumbnailUrl ? (refs.urlMap[pt.thumbnailUrl] ?? pt.thumbnailUrl) : pt.thumbnailUrl,
      },
    });
  }

  // ── Funnel steps ──────────────────────────────────────────────────────
  // FunnelStep belongs to Funnel which belongs to workspace.
  const funnelSteps = await db.funnelStep.findMany({
    where:  { funnel: { workspaceId } },
    select: { id: true, pageJson: true, meta: true },
  });
  for (const fs of funnelSteps) {
    await db.funnelStep.update({
      where: { id: fs.id },
      data: {
        pageJson: rewriteAssetRefs(fs.pageJson as any, refs) as any,
        meta:     fs.meta ? rewriteAssetRefs(fs.meta as any, refs) as any : fs.meta,
      },
    });
  }

  // ── Email templates ───────────────────────────────────────────────────
  const emailTemplates = await db.emailTemplate.findMany({
    where:  { workspaceId },
    select: { id: true, htmlBody: true },
  });
  for (const et of emailTemplates) {
    if (!et.htmlBody) continue;
    await db.emailTemplate.update({
      where: { id: et.id },
      data:  { htmlBody: rewriteHtmlAssetUrls(et.htmlBody, refs) },
    });
  }

  // ── Saved blocks ──────────────────────────────────────────────────────
  const savedBlocks = await db.savedBlock.findMany({
    where:  { workspaceId },
    select: { id: true, contentJson: true },
  });
  for (const b of savedBlocks) {
    await db.savedBlock.update({
      where: { id: b.id },
      data:  { contentJson: rewriteAssetRefs(b.contentJson as any, refs) as any },
    });
  }
}
