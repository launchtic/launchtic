import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";
import { assertSlugAvailable } from "../../../../lib/funnels/slug-validation";

// Validate pageJson — must be a valid object (Craft.js JSON)
const metaSchema = z.object({
  seo: z.object({
    title:       z.string().optional(),
    description: z.string().optional(),
    ogImage:     z.string().optional(),
  }).optional(),
  tracking: z.object({
    gaId:         z.string().optional(),
    fbPixelId:    z.string().optional(),
    gtmId:        z.string().optional(),
    tiktokPixelId:z.string().optional(),
    headScript:   z.string().optional(),
    bodyScript:   z.string().optional(),
  }).optional(),
  font: z.object({
    fontType:   z.string().optional(),
    fontFamily: z.string().optional(),
    fontStyle:  z.string().optional(),
  }).optional(),
}).optional();

const patchSchema = z.object({
  pageJson: z.union([z.string(), z.record(z.unknown())]).optional(),
  name:     z.string().min(1).max(100).optional(),
  slug:     z.string().max(200).regex(/^[a-z0-9-]*$/, "Slug may only contain lowercase letters, numbers and hyphens").optional(),
  meta:     metaSchema,
});

type Params = { params: Promise<{ id: string }> };

// ─── GET /api/funnel-steps/:id ────────────────────────────────────────────────
// Load page JSON for the editor

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const r = await requireAccess("funnels:read");
    if (!r.ok) return r.response;

    const step = await db.funnelStep.findUnique({
      where: { id },
      include: {
        funnel: {
          select: {
            id: true,
            name: true,
            currency: true,
            workspaceId: true,
            // Load the funnel's assigned custom domain so the editor's
            // preview button + URL prefix point at the right host. Without
            // this the frontend falls back to the default pages domain.
            domains: {
              include: { domain: { select: { domain: true, verified: true } } },
              take: 1,
            },
          },
        },
        resources: true,
      },
    });

    if (!step) return err("Funnel step not found", 404);

    // Only treat a verified domain as the funnel's primary — unverified
    // assignments would generate links that 404/error in the browser.
    const primaryDomain = step.funnel.domains[0]?.domain.verified
      ? step.funnel.domains[0].domain.domain
      : null;

    return ok({
      id:   step.id,
      name: step.name,
      slug: step.slug,
      type: step.type,
      meta: step.meta ?? null,
      order: step.order,
      offerType: step.offerType ?? null,
      physicalProductId: step.physicalProductId ?? null,
      resources: step.resources ?? null,
      couponIds: step.couponIds ?? [],
      shippingFee: step.shippingFee ?? 0,
      pageJson: step.pageJson,
      funnel: {
        id:           step.funnel.id,
        name:         step.funnel.name,
        currency:     step.funnel.currency,
        workspaceId:  step.funnel.workspaceId,
        primaryDomain,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}

// ─── PATCH /api/funnel-steps/:id ─────────────────────────────────────────────
// Save page JSON from the editor (auto-save)

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const r = await requireAccess("funnels:write");
    if (!r.ok) return r.response;
    const body = await req.json();
    const data = patchSchema.parse(body);

    // Build update payload
    const updateData: Record<string, unknown> = {};

    if (data.name !== undefined) {
      updateData.name = data.name;
    }

    if (data.slug !== undefined) {
      // Validate cross-funnel uniqueness only if slug is actually changing.
      // Checking on every PATCH (even when slug stays the same) would block
      // unrelated edits — assertSlugAvailable filters out the step itself
      // via excludeStepId, but it's still a wasted query.
      const current = await db.funnelStep.findUnique({
        where: { id },
        select: { slug: true, funnelId: true, funnel: { select: { workspaceId: true } } },
      });
      if (!current) return err("Funnel step not found", 404);
      if (current.slug !== data.slug) {
        await assertSlugAvailable({
          workspaceId: current.funnel.workspaceId,
          funnelId: current.funnelId,
          slug: data.slug,
          excludeStepId: id,
        });
      }
      updateData.slug = data.slug;
    }

    if (data.meta !== undefined) {
      updateData.meta = data.meta;
    }

    if (data.pageJson !== undefined) {
      // Normalize: always store as an object (JSONB), not a string
      updateData.pageJson = normalizeJson(data.pageJson);
    }

    if (Object.keys(updateData).length === 0) {
      return err("No fields to update", 400);
    }

    const step = await db.funnelStep.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        slug: true,
        pageJson: true,
        updatedAt: true,
        funnel: { select: { workspaceId: true } },
      },
    });

    // Invalidate cache on ANY change (pageJson, meta, slug…) — otherwise the
    // renderer will keep serving stale data and font / SEO / tracking
    // updates won't take effect until the cache TTL expires.
    if (Object.keys(updateData).length > 0) {
      invalidateCache(step.funnel.workspaceId, id).catch(() => {});
    }

    return ok({ id: step.id, updatedAt: step.updatedAt });
  } catch (error) {
    return handleError(error, {
      "funnelId,slug": "This URL path is already used by another step in this funnel.",
    });
  }
}

// ─── DELETE /api/funnel-steps/:id ────────────────────────────────────────────

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const r = await requireAccess("funnels:write");
    if (!r.ok) return r.response;

    await db.funnelStep.delete({ where: { id } });

    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function invalidateCache(workspaceId: string, funnelStepId: string) {
  try {
    const [domains, step] = await Promise.all([
      db.domain.findMany({ where: { workspaceId }, select: { domain: true } }),
      db.funnelStep.findUnique({ where: { id: funnelStepId }, select: { slug: true } }),
    ]);
    if (!step) return;
    // Internal docker DNS hostname — direct hop to renderer container, avoids
    // bouncing through Caddy. Falls back to localhost for dev outside Docker.
    const rendererUrl = process.env.RENDERER_INTERNAL_URL ?? "http://renderer:3001";
    const targets = domains.length > 0 ? domains : [{ domain: `localhost:3001` }];
    for (const { domain } of targets) {
      fetch(`${rendererUrl}/api/cache/invalidate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, slug: step.slug }),
      }).catch(() => {});
    }
  } catch { /* non-critical */ }
}

function normalizeJson(value: string | Record<string, unknown>): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value;
}
