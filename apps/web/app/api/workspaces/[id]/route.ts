import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "../../../../lib/auth";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../lib/api";

const renameSchema = z.object({
  name: z.string().min(1).max(100),
});

// PATCH /api/workspaces/[id] — rename workspace (owner only)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return err("Unauthorized", 401);

    const userId = session.user?.id as string;
    const { id } = await params;

    const workspace = await db.workspace.findUnique({ where: { id }, select: { ownerId: true } });
    if (!workspace)              return err("Workspace not found", 404);
    if (workspace.ownerId !== userId) return err("Only the owner can rename this workspace", 403);

    const { name } = renameSchema.parse(await req.json());
    const updated = await db.workspace.update({
      where: { id },
      data: { name },
      select: { id: true, name: true, slug: true },
    });

    return ok(updated);
  } catch (error) {
    return handleError(error);
  }
}

// DELETE /api/workspaces/[id] — delete workspace (owner only, not last workspace)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return err("Unauthorized", 401);

    const userId = session.user?.id as string;
    const { id } = await params;

    const workspace = await db.workspace.findUnique({ where: { id }, select: { ownerId: true } });
    if (!workspace)              return err("Workspace not found", 404);
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
