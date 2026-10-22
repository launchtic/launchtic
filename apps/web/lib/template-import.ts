// Import a .ltbundle into a workspace. Reverses the export-bundle flow:
// decode the bundle → materialize its embedded assets (dedup by sha256) →
// rewrite content references → create the entity by kind (page/email/funnel).
//
// Unlike the clone importAssets (which fetches bytes over HTTP), bundle assets
// are embedded in the blob, so we read them via decoded.getAsset(i).

import { createHash } from "crypto";
import { db } from "@launchtic/database";
import { decodeBundle, type DecodedBundle } from "./template-bundle";
import { rewriteAssetRefs, rewriteHtmlAssetUrls, type AssetRefMap } from "./asset-import";
import { getDriver, getDriverName, buildKey } from "./storage";

export type ImportResult = { kind: string; id: string; name: string };

// OPTIN and SALES were merged into LANDING; older bundles still use them.
function stepType(t: unknown): string {
  return t === "OPTIN" || t === "SALES" ? "LANDING" : String(t);
}


// Materialize the bundle's embedded assets in the workspace (dedup by sha256).
// Returns a urlMap (originalUrl → new url) used to rewrite content references.
async function importBundleAssets(
  workspaceId: string,
  decoded: DecodedBundle,
): Promise<AssetRefMap> {
  const idMap: Record<string, string> = {};
  const urlMap: Record<string, string> = {};
  const { assets } = decoded.manifest;
  if (!assets.length) return { idMap, urlMap };

  const driverName = await getDriverName(workspaceId);
  const driver = await getDriver(workspaceId);

  for (let i = 0; i < assets.length; i++) {
    const a = assets[i];

    // Dedup: same content already in this workspace → reuse its URL.
    const existing = await db.asset.findFirst({
      where: { workspaceId, sha256: a.sha256 },
      select: { url: true },
    });
    if (existing) { urlMap[a.originalUrl] = existing.url; continue; }

    const bytes = decoded.getAsset(i);
    const got = createHash("sha256").update(bytes).digest("hex");
    if (got !== a.sha256) {
      console.warn(`[template-import] sha256 mismatch for ${a.filename} — skipping`);
      continue; // content rewrite leaves the original URL in place
    }

    const key = buildKey(workspaceId, a.filename);
    const newUrl = await driver.upload(key, bytes, a.mimeType);
    await db.asset.create({
      data: {
        workspaceId,
        filename:    a.filename,
        mimeType:    a.mimeType,
        sha256:      a.sha256,
        bytes:       bytes.length,
        width:       a.width  ?? null,
        height:      a.height ?? null,
        storagePath: key,
        url:         newUrl,
        driver:      driverName,
      },
    });
    urlMap[a.originalUrl] = newUrl;
  }

  return { idMap, urlMap };
}

// Decode + import one .ltbundle. Throws on a malformed bundle / unknown kind
// (caller maps to 400). Always creates a fresh entity; assets dedupe by hash.
export async function importBundle(workspaceId: string, buf: Buffer): Promise<ImportResult> {
  const decoded = decodeBundle(buf);
  const { kind, template } = decoded.manifest;
  const refs = await importBundleAssets(workspaceId, decoded);
  const name = String(template.name ?? "Imported");

  if (kind === "page") {
    const created = await db.pageTemplate.create({
      data: {
        workspaceId,
        name,
        type:         stepType(template.type) as never,
        pageJson:     rewriteAssetRefs(template.pageJson ?? {}, refs) as never,
        meta:         rewriteAssetRefs(template.meta ?? {}, refs) as never,
        thumbnailUrl: template.thumbnailUrl
          ? (refs.urlMap[template.thumbnailUrl as string] ?? (template.thumbnailUrl as string))
          : null,
        isActive:  true,
        isDefault: false,
      },
      select: { id: true },
    });
    return { kind, id: created.id, name };
  }

  if (kind === "email") {
    const created = await db.emailTemplate.create({
      data: {
        workspaceId,
        name,
        subject:  String(template.subject ?? ""),
        htmlBody: template.htmlBody ? rewriteHtmlAssetUrls(String(template.htmlBody), refs) : "",
        category: ((template.category as string) || "MARKETING") as never,
        isSystem: false,
      },
      select: { id: true },
    });
    return { kind, id: created.id, name };
  }

  if (kind === "funnel") {
    const steps = Array.isArray(template.steps) ? (template.steps as Record<string, unknown>[]) : [];
    const created = await db.funnel.create({
      data: {
        workspaceId,
        name,
        currency: (template.currency as string) ?? "usd",
        favicon:  (template.favicon as string | null) ?? null,
        status:   "ACTIVE",
        steps: {
          create: steps.map((s, i) => ({
            name:     String(s.name ?? `Step ${i + 1}`),
            slug:     String(s.slug ?? `step-${i + 1}`),
            type:     stepType(s.type) as never,
            order:    typeof s.order === "number" ? s.order : i,
            pageJson: rewriteAssetRefs(s.pageJson ?? {}, refs) as never,
            meta:     rewriteAssetRefs(s.meta ?? {}, refs) as never,
          })),
        },
      },
      select: { id: true },
    });
    return { kind, id: created.id, name };
  }

  throw new Error(`Unknown bundle kind: ${kind}`);
}
