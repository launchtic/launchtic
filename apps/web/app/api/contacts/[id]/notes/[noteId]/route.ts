import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { z } from "zod";
import { ok, err, handleError } from "../../../../../../lib/api";
import { requireAccess } from "../../../../../../lib/permissions";

type Params = { params: Promise<{ id: string; noteId: string }> };

const updateSchema = z.object({ body: z.string().trim().min(1).max(5000) });

// Confirm the note belongs to a contact in the caller's workspace.
async function ownedNote(noteId: string, contactId: string, workspaceId: string) {
  return db.contactNote.findFirst({
    where: { id: noteId, contactId, contact: { workspaceId } },
    select: { id: true },
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("contacts:write");
    if (!r.ok) return r.response;

    const { id: contactId, noteId } = await params;
    const { body } = updateSchema.parse(await req.json());

    const note = await ownedNote(noteId, contactId, r.workspaceId);
    if (!note) return err("Note not found", 404);

    const updated = await db.contactNote.update({
      where: { id: noteId },
      data: { body },
      include: { author: { select: { name: true, email: true } } },
    });

    return ok({
      id: updated.id,
      body: updated.body,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      authorName: updated.author?.name ?? updated.author?.email ?? null,
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("contacts:write");
    if (!r.ok) return r.response;

    const { id: contactId, noteId } = await params;
    const note = await ownedNote(noteId, contactId, r.workspaceId);
    if (!note) return err("Note not found", 404);

    await db.contactNote.delete({ where: { id: noteId } });
    return ok({ id: noteId });
  } catch (error) {
    return handleError(error);
  }
}
