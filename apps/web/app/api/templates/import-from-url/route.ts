import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../lib/api";
import { requireAccess, can } from "../../../../lib/permissions";
import { generateUniqueSlug } from "../../../../lib/funnels/slug-validation";
import {
  importAssets,
  rewriteAssetRefs,
  rewriteHtmlAssetUrls,
  type AssetManifestEntry,
} from "../../../../lib/asset-import";

const importSchema = z.object({
  url: z.string().url(),
});

const GALLERY_ORIGIN = "https://launchtic.com";
const SLUG_RE = /^[a-z0-9-]+$/;

/** Validates the URL is from launchtic.com and extracts the slug. */
function extractSlug(url: string): string | null {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return null; }
  if (parsed.origin !== GALLERY_ORIGIN) return null;
  const match = parsed.pathname.match(/^\/api\/public-templates\/([a-z0-9-]+)$/);
  return match ? match[1] : null;
}

// ─── POST /api/templates/import-from-url ─────────────────────────────────────
// Body: { url: string }  — must be https://launchtic.com/api/public-templates/:slug
// Materializes every asset in the manifest into the current workspace's
// storage (dedup by sha256), then rewrites assetId + URL references in
// pageJson / htmlBody so the imported content is fully self-contained.

export async function POST(req: NextRequest) {
  try {
    const r = await requireAccess();
    if (!r.ok) return r.response;
    const { workspaceId, permissions } = r;

    const body = await req.json();
    const { url } = importSchema.parse(body);

    const slug = extractSlug(url);
    if (!slug || !SLUG_RE.test(slug)) {
      return err(`URL must be ${GALLERY_ORIGIN}/api/public-templates/<slug>`, 400);
    }

    // Fetch from gallery — no cache so we always get latest
    const galRes = await fetch(url, { cache: "no-store" });
    if (!galRes.ok) return err("Template not found in gallery", 404);
    const data = await galRes.json();

    if (!data.kind) return err("Invalid template response from gallery", 400);

    // ── Materialize manifest assets up-front (shared across kinds) ──────────
    const manifest: AssetManifestEntry[] = Array.isArray(data.assets) ? data.assets : [];
    const refs = await importAssets(workspaceId, manifest, GALLERY_ORIGIN);

    // ── page ──────────────────────────────────────────────────────────────────
    if (data.kind === "page") {
      if (!can(permissions, "settings:page_templates:write")) return err("Forbidden", 403);

      const template = await db.pageTemplate.create({
        data: {
          workspaceId,
          name:         data.name,
          description:  data.description ?? null,
          type:         data.type,
          tags:         Array.isArray(data.tags) ? data.tags : [],
          pageJson:     rewriteAssetRefs(data.pageJson ?? {}, refs),
          meta:         rewriteAssetRefs(data.meta    ?? {}, refs),
          thumbnailUrl: refs.urlMap[data.thumbnailUrl ?? ""] ?? data.thumbnailUrl ?? null,
        },
        select: { id: true, name: true, type: true, createdAt: true },
      });

      return ok({ kind: "page", template }, 201);
    }

    // ── email ─────────────────────────────────────────────────────────────────
    if (data.kind === "email") {
      if (!can(permissions, "email_templates:write")) return err("Forbidden", 403);

      const template = await db.emailTemplate.create({
        data: {
          workspaceId,
          name:     data.name,
          subject:  data.subject  ?? "",
          htmlBody: rewriteHtmlAssetUrls(data.htmlBody ?? "", refs),
          category: "MARKETING",
          isSystem: false,
        },
        select: { id: true, name: true, subject: true, createdAt: true },
      });

      return ok({ kind: "email", template }, 201);
    }

    // ── funnel ────────────────────────────────────────────────────────────────
    if (data.kind === "funnel") {
      if (!can(permissions, "funnels:write")) return err("Forbidden", 403);

      type RawStep = { name: string; type: string; slug?: string; order: number; pageJson?: unknown };
      const steps: RawStep[] = Array.isArray(data.steps) ? data.steps : [];

      const funnel = await db.funnel.create({
        data: { workspaceId, name: data.name, currency: data.currency ?? "usd" },
        select: { id: true },
      });

      const createdSteps = [];
      for (const step of steps) {
        const resolvedSlug = await generateUniqueSlug({
          workspaceId,
          funnelId: funnel.id,
          baseName: step.slug ?? step.name,
        });
        const s = await db.funnelStep.create({
          data: {
            funnelId: funnel.id,
            name:     step.name,
            slug:     resolvedSlug,
            type:     step.type as any,
            order:    step.order,
            pageJson: rewriteAssetRefs(step.pageJson ?? {}, refs),
          },
          select: { id: true, name: true, slug: true, type: true, order: true },
        });
        createdSteps.push(s);
      }

      return ok({ kind: "funnel", funnel: { id: funnel.id, steps: createdSteps } }, 201);
    }

    return err(`Unsupported template kind: ${data.kind}`, 400);
  } catch (error) {
    return handleError(error);
  }
}
