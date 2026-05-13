import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { z } from "zod";
import { ok, err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";
import { fireTrigger } from "../../../../../lib/automations";

const tagActionSchema = z.object({
  tagId: z.string().min(1),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("contacts:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { id: contactId } = await params;
    const body = await req.json();
    const { tagId } = tagActionSchema.parse(body);

    const [contact, tag] = await Promise.all([
      db.contact.findFirst({ where: { id: contactId, workspaceId } }),
      db.tag.findFirst({ where: { id: tagId, workspaceId } }),
    ]);

    if (!contact) return err("Contact not found", 404);
    if (!tag) return err("Tag not found or does not belong to this workspace", 404);

    // Idempotency: only fire trigger if tag was actually newly added
    const before = await db.contactTag.findUnique({
      where: { contactId_tagId: { contactId, tagId } },
    });

    await db.$transaction([
      db.contactTag.upsert({
        where: { contactId_tagId: { contactId, tagId } },
        update: {},
        create: { contactId, tagId },
      }),
      db.contactEvent.create({
        data: {
          contactId,
          type: "TAG_ADDED",
          data: { tagName: tag.name },
        },
      }),
    ]);

    // Fire automation trigger (best-effort, fire-and-forget)
    if (!before) {
      fireTrigger(workspaceId, "TAG_ADDED", { contactId, tagId }).catch(() => {});
    }

    return ok({ contactId, tagId, tagName: tag.name }, 201);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("contacts:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { id: contactId } = await params;
    const body = await req.json();
    const { tagId } = tagActionSchema.parse(body);

    const [contact, tag] = await Promise.all([
      db.contact.findFirst({ where: { id: contactId, workspaceId } }),
      db.tag.findFirst({ where: { id: tagId, workspaceId } }),
    ]);

    if (!contact) return err("Contact not found", 404);
    if (!tag) return err("Tag not found or does not belong to this workspace", 404);

    const existing = await db.contactTag.findUnique({
      where: { contactId_tagId: { contactId, tagId } },
    });

    if (!existing) return err("Tag is not assigned to this contact", 404);

    await db.$transaction([
      db.contactTag.delete({
        where: { contactId_tagId: { contactId, tagId } },
      }),
      db.contactEvent.create({
        data: {
          contactId,
          type: "TAG_REMOVED",
          data: { tagName: tag.name },
        },
      }),
    ]);

    fireTrigger(workspaceId, "TAG_REMOVED", { contactId, tagId }).catch(() => {});

    return ok({ contactId, tagId, tagName: tag.name });
  } catch (error) {
    return handleError(error);
  }
}
