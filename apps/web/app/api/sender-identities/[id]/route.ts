import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { z } from "zod";
import { ok, err, handleError, getWorkspaceId } from "../../../../lib/api";

const updateSchema = z.object({
  name:  z.string().min(1).max(120).optional(),
  email: z.string().email().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) return err("Unauthorized", 401);

    const { id } = await params;
    const existing = await db.senderIdentity.findFirst({ where: { id, workspaceId } });
    if (!existing) return err("Sender identity not found", 404);

    const data = updateSchema.parse(await req.json());
    const updated = await db.senderIdentity.update({ where: { id }, data });
    return ok(updated);
  } catch (error) {
    return handleError(error, { "workspaceId,email": "An identity with this email already exists." });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) return err("Unauthorized", 401);

    const { id } = await params;
    const existing = await db.senderIdentity.findFirst({ where: { id, workspaceId } });
    if (!existing) return err("Sender identity not found", 404);

    // Block delete of the only default — workspace would have no default left.
    if (existing.isDefault) {
      const total = await db.senderIdentity.count({ where: { workspaceId } });
      if (total === 1) {
        return err("Cannot delete the only sender identity. Add another first.", 400);
      }
      // Promote another to default before deleting.
      const next = await db.senderIdentity.findFirst({
        where: { workspaceId, id: { not: id } },
        orderBy: { createdAt: "asc" },
      });
      if (next) {
        await db.senderIdentity.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    }

    await db.senderIdentity.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
