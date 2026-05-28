import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";

type Params = { params: Promise<{ id: string }> };

// Verify the variant belongs to a step in the caller's workspace.
async function scopedVariant(variantId: string, workspaceId: string) {
  const variant = await db.stepVariant.findUnique({
    where: { id: variantId },
    select: {
      id: true, name: true, pageJson: true, weight: true, isControl: true, stepId: true,
      step: { select: { funnel: { select: { workspaceId: true } } } },
    },
  });
  if (!variant || variant.step.funnel.workspaceId !== workspaceId) return null;
  return variant;
}

// GET /api/step-variants/:id — load a variant's page for editing.
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const r = await requireAccess("funnels:read");
    if (!r.ok) return r.response;
    const variant = await scopedVariant(id, r.workspaceId);
    if (!variant) return err("Variant not found", 404);
    return ok({ id: variant.id, name: variant.name, pageJson: variant.pageJson, weight: variant.weight, isControl: variant.isControl, stepId: variant.stepId });
  } catch (error) {
    return handleError(error);
  }
}

const patchSchema = z.object({
  pageJson: z.union([z.string(), z.record(z.unknown())]).optional(),
  name:     z.string().min(1).max(100).optional(),
  weight:   z.number().int().min(0).max(100).optional(),
});

// PATCH /api/step-variants/:id — save variant page / weight / name.
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const r = await requireAccess("funnels:write");
    if (!r.ok) return r.response;
    const variant = await scopedVariant(id, r.workspaceId);
    if (!variant) return err("Variant not found", 404);

    const data = patchSchema.parse(await req.json());
    const update: Record<string, unknown> = {};
    if (data.name !== undefined)   update.name = data.name;
    if (data.weight !== undefined) update.weight = data.weight;
    if (data.pageJson !== undefined) {
      update.pageJson = typeof data.pageJson === "string"
        ? JSON.parse(data.pageJson || "{}")
        : data.pageJson;
    }
    if (Object.keys(update).length === 0) return err("No fields to update", 400);

    const saved = await db.stepVariant.update({ where: { id }, data: update, select: { id: true, updatedAt: true } });
    return ok({ id: saved.id, updatedAt: saved.updatedAt });
  } catch (error) {
    return handleError(error);
  }
}
