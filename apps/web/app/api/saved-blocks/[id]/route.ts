import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";

const tagSchema = z
  .array(z.string().trim().min(1).max(30))
  .max(10)
  .transform((arr) => Array.from(new Set(arr.map((t) => t.toLowerCase()))));

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  tags: tagSchema.optional(),
});

type Params = { params: Promise<{ id: string }> };

// GET /api/saved-blocks/:id  → returns full block including contentJson
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess();
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { id } = await params;

    const block = await db.savedBlock.findFirst({
      where: { id, workspaceId },
    });

    if (!block) return err("Saved block not found", 404);

    return ok(block);
  } catch (error) {
    return handleError(error);
  }
}

// PATCH /api/saved-blocks/:id  → update name and/or tags
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("funnels:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { id } = await params;

    const existing = await db.savedBlock.findFirst({ where: { id, workspaceId } });
    if (!existing) return err("Saved block not found", 404);

    const body = await req.json();
    const data = updateSchema.parse(body);

    const updateData: { name?: string; tags?: string[] } = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.tags !== undefined) updateData.tags = data.tags;

    const block = await db.savedBlock.update({
      where: { id },
      data: updateData,
      select: { id: true, name: true, kind: true, tags: true, updatedAt: true },
    });

    return ok(block);
  } catch (error) {
    return handleError(error);
  }
}

// DELETE /api/saved-blocks/:id
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("funnels:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { id } = await params;

    const existing = await db.savedBlock.findFirst({ where: { id, workspaceId } });
    if (!existing) return err("Saved block not found", 404);

    await db.savedBlock.delete({ where: { id } });

    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
