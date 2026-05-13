import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { z } from "zod";
import { ok, err, handleError } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";

const updateTagSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  color: z.string().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("contacts:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { id } = await params;

    const existing = await db.tag.findFirst({ where: { id, workspaceId } });
    if (!existing) return err("Tag not found", 404);

    const body = await req.json();
    const data = updateTagSchema.parse(body);

    if (data.name && data.name !== existing.name) {
      const conflict = await db.tag.findUnique({
        where: { workspaceId_name: { workspaceId, name: data.name } },
      });
      if (conflict) return err("A tag with this name already exists", 409);
    }

    const tag = await db.tag.update({
      where: { id },
      data,
      include: { _count: { select: { contacts: true } } },
    });

    return ok(tag);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("contacts:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { id } = await params;

    const existing = await db.tag.findFirst({ where: { id, workspaceId } });
    if (!existing) return err("Tag not found", 404);

    await db.tag.delete({ where: { id } });

    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
