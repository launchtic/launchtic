import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { z } from "zod";
import { ok, err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";

type Params = { params: Promise<{ id: string }> };

const noteSchema = z.object({ body: z.string().trim().min(1).max(5000) });

function serialize(n: {
  id: string; body: string; pinned: boolean; createdAt: Date; updatedAt: Date;
  author: { name: string | null; email: string } | null;
}) {
  return {
    id: n.id,
    body: n.body,
    pinned: n.pinned,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
    authorName: n.author?.name ?? n.author?.email ?? null,
  };
}

// List a contact's notes, newest first.
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("contacts:read");
    if (!r.ok) return r.response;

    const { id: contactId } = await params;
    const contact = await db.contact.findFirst({
      where: { id: contactId, workspaceId: r.workspaceId },
      select: { id: true },
    });
    if (!contact) return err("Contact not found", 404);

    const notes = await db.contactNote.findMany({
      where: { contactId },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      include: { author: { select: { name: true, email: true } } },
    });

    return ok({ notes: notes.map(serialize) });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("contacts:write");
    if (!r.ok) return r.response;

    const { id: contactId } = await params;
    const { body } = noteSchema.parse(await req.json());

    const contact = await db.contact.findFirst({
      where: { id: contactId, workspaceId: r.workspaceId },
      select: { id: true },
    });
    if (!contact) return err("Contact not found", 404);

    const note = await db.contactNote.create({
      data: { contactId, body, authorId: r.userId },
      include: { author: { select: { name: true, email: true } } },
    });

    return ok(serialize(note), 201);
  } catch (error) {
    return handleError(error);
  }
}
