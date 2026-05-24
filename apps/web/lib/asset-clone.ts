// Helpers for cloning assets between workspaces (used by the workspace
// clone route after content has been duplicated). Runs after the main DB
// transaction so file copies don't hold a connection open.

import { db } from "@launchtic/database";
import { getDriver, getDriverName, buildKey } from "./storage";
import {
  rewriteAssetRefs,
  rewriteHtmlAssetUrls,
  type AssetRefMap,
} from "./asset-import";

/**
 * Copy every Asset row from `sourceWorkspaceId` to `destWorkspaceId`:
 *  - reads source file via its declared driver
 *  - writes to dest workspace's current driver
 *  - dedups by sha256 in case the dest already has the same content
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

  const destDriverName = await getDriverName(destWorkspaceId);
  const destDriver     = await getDriver(destWorkspaceId);

  for (const src of sourceAssets) {
    // Dedup against dest (in case dest already had a previous clone or import
    // of the same content)
    const existing = await db.asset.findFirst({
      where:  { workspaceId: destWorkspaceId, sha256: src.sha256 },
      select: { id: true, url: true },
    });
    if (existing) {
      idMap[src.id]   = existing.id;
      urlMap[src.url] = existing.url;
      continue;
    }

    // Fetch source bytes via the driver that wrote them. For local-driver
    // sources, file is at public/uploads/{storagePath}; for S3 we go via HTTP
    // (the public url is reachable from server in normal deploys).
    let buffer: Buffer;
    try {
      if (src.driver === "local") {
        const { readFile } = await import("fs/promises");
        const path = await import("path");
        const fullPath = path.join(process.cwd(), "public", "uploads", src.storagePath);
        buffer = await readFile(fullPath);
      } else {
        // S3 / external — fetch via public URL
        const res = await fetch(src.url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        buffer = Buffer.from(await res.arrayBuffer());
      }
    } catch (e: any) {
      console.error(`[asset-clone] failed to read source asset ${src.id}:`, e?.message ?? e);
      continue;
    }

    const key = buildKey(destWorkspaceId, src.filename, "cloned");
    const newUrl = await destDriver.upload(key, buffer, src.mimeType);

    const created = await db.asset.create({
      data: {
        workspaceId: destWorkspaceId,
        filename:    src.filename,
        mimeType:    src.mimeType,
        sha256:      src.sha256,
        bytes:       src.bytes,
        width:       src.width,
        height:      src.height,
        storagePath: key,
        url:         newUrl,
        driver:      destDriverName,
      },
      select: { id: true },
    });

    idMap[src.id] = created.id;
    urlMap[src.url] = newUrl;
  }

  return { idMap, urlMap };
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
