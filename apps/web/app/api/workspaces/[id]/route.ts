import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "Slug may only contain lowercase letters, numbers, and hyphens.",
  }).optional(),
}).refine((d) => d.name || d.slug, { message: "Provide at least name or slug." });

// PATCH /api/workspaces/[id] — update name and/or slug (owner only)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const r = await requireAccess("workspace:manage");
    if (!r.ok) return r.response;
    const { userId } = r;

    const { id } = await params;
    const workspace = await db.workspace.findUnique({ where: { id }, select: { ownerId: true } });
    if (!workspace)                   return err("Workspace not found", 404);
    if (workspace.ownerId !== userId) return err("Only the owner can update this workspace", 403);

    const body = updateSchema.parse(await req.json());
    const updated = await db.workspace.update({
      where: { id },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.slug && { slug: body.slug }),
      },
      select: { id: true, name: true, slug: true },
    });

    return ok(updated);
  } catch (error) {
    return handleError(error, { "slug": "This slug is already taken." });
  }
}

// DELETE /api/workspaces/[id] — delete workspace (owner only, not last workspace)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const r = await requireAccess("workspace:manage");
    if (!r.ok) return r.response;
    const { userId } = r;

    const { id } = await params;
    const workspace = await db.workspace.findUnique({ where: { id }, select: { ownerId: true } });
    if (!workspace)                   return err("Workspace not found", 404);
    if (workspace.ownerId !== userId) return err("Only the owner can delete this workspace", 403);

    // Prevent deleting the user's last workspace.
    const count = await db.workspace.count({ where: { ownerId: userId } });
    if (count <= 1) return err("You cannot delete your only workspace.", 400);

    await db.workspace.delete({ where: { id } });

    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
