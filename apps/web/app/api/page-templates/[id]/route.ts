import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";
import { getDriver } from "../../../../lib/storage";

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
  name:         z.string().min(1).max(100).optional(),
  description:  z.string().max(500).nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  pageJson:     z.union([z.string(), z.record(z.unknown())]).optional(),
  meta:         metaSchema,
  tags:         z.array(z.string().min(1).max(40)).max(20).optional(),
  isActive:     z.boolean().optional(),
  type:         z.enum(["OPTIN", "SALES", "CHECKOUT", "UPSELL", "DOWNSELL", "THANKYOU", "CUSTOM"]).optional(),
});

type Params = { params: Promise<{ id: string }> };

// ─── GET /api/page-templates/:id ─────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("settings:page_templates:read");
    if (!r.ok) return r.response;
    const { workspaceId } = r;
    const { id } = await params;
    const template = await db.pageTemplate.findFirst({ where: { id, workspaceId } });
    if (!template) return err("Template not found", 404);
    return ok(template);
  } catch (error) {
    return handleError(error);
  }
}

// ─── PATCH /api/page-templates/:id ───────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("settings:page_templates:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;
    const { id } = await params;
    const body = await req.json();
    const data = patchSchema.parse(body);

    const updateData: Record<string, unknown> = {};
    if (data.name         !== undefined) updateData.name         = data.name;
    if (data.description  !== undefined) updateData.description  = data.description;
    if (data.thumbnailUrl !== undefined) updateData.thumbnailUrl = data.thumbnailUrl;
    if (data.pageJson     !== undefined) updateData.pageJson     = normalizeJson(data.pageJson);
    if (data.meta         !== undefined) updateData.meta         = data.meta;
    if (data.tags         !== undefined) updateData.tags         = data.tags;
    if (data.isActive     !== undefined) updateData.isActive     = data.isActive;
    if (data.type         !== undefined) updateData.type         = data.type;

    if (Object.keys(updateData).length === 0) return err("No fields to update", 400);

    // Scoped check: template must belong to caller's workspace.
    const current = await db.pageTemplate.findFirst({
      where: { id, workspaceId },
      select: { thumbnailUrl: true },
    });
    if (!current) return err("Template not found", 404);

    if (data.thumbnailUrl !== undefined && current.thumbnailUrl && current.thumbnailUrl !== data.thumbnailUrl) {
      deleteOldThumb(current.thumbnailUrl, workspaceId).catch(() => {});
    }

    const template = await db.pageTemplate.update({
      where: { id },
      data: updateData,
      select: { id: true, name: true, description: true, thumbnailUrl: true, type: true, tags: true, isActive: true, updatedAt: true },
    });

    return ok(template);
  } catch (error) {
    return handleError(error);
  }
}

// ─── DELETE /api/page-templates/:id ──────────────────────────────────────────

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("settings:page_templates:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;
    const { id } = await params;
    const template = await db.pageTemplate.findFirst({
      where: { id, workspaceId },
      select: { thumbnailUrl: true },
    });
    if (!template) return err("Template not found", 404);
    if (template.thumbnailUrl) deleteOldThumb(template.thumbnailUrl, workspaceId).catch(() => {});
    await db.pageTemplate.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function deleteOldThumb(url: string, workspaceId: string) {
  const key = extractKey(url);
  if (!key || !key.startsWith(`${workspaceId}/`)) return;
  const driver = await getDriver(workspaceId);
  await driver.delete(key);
}

function extractKey(url: string): string | null {
  if (url.startsWith("/uploads/")) return url.slice("/uploads/".length);
  try {
    const key = new URL(url).pathname.replace(/^\//, "");
    return key || null;
  } catch { return null; }
}

function normalizeJson(value: string | Record<string, unknown>): Record<string, unknown> {
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return {}; }
  }
  return value;
}
