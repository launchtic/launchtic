import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { z } from "zod";
import { ok, err, handleError } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";

const stepSchema = z.object({
  // Optional id — present = update existing, absent = create new.
  id:              z.string().optional(),
  delayMinutes:    z.number().int().min(0).default(0),
  emailTemplateId: z.string().nullable().optional(),
  emailSubject:    z.string().min(1),
  emailHtmlBody:   z.string().min(1),
  emailFromName:   z.string().nullable().optional(),
  emailFromEmail:  z.string().email().nullable().optional(),
});

const updateSchema = z.object({
  name:  z.string().min(1).max(200).optional(),
  // Replace-style step sync if present.
  steps: z.array(stepSchema).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("sequences:read");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { id } = await params;
    const sequence = await db.emailSequence.findFirst({
      where: { id, workspaceId },
      include: { steps: { orderBy: { order: "asc" } } },
    });
    if (!sequence) return err("Sequence not found", 404);
    return ok(sequence);
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("sequences:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { id } = await params;
    const existing = await db.emailSequence.findFirst({
      where: { id, workspaceId },
      include: { steps: true },
    });
    if (!existing) return err("Sequence not found", 404);

    const data = updateSchema.parse(await req.json());

    const scalarUpdate: any = {};
    if (data.name !== undefined) scalarUpdate.name = data.name;

    if (data.steps) {
      // Structural-change guard for ACTIVE sequences. Live enrollments hold a
      // `currentStepIndex` int into the step array; deleting/reordering would
      // corrupt that pointer, so we only allow content edits (subject, body,
      // delay, sender) on the existing step set. Pause the sequence to add
      // or remove steps.
      if (existing.status === "ACTIVE") {
        const incomingIds = data.steps.map((s) => s.id).filter(Boolean) as string[];
        const existingIds = existing.steps.map((s) => s.id);
        const sameLength = incomingIds.length === existingIds.length && incomingIds.length === data.steps.length;
        const sameSet = sameLength && incomingIds.every((id) => existingIds.includes(id));
        if (!sameSet) {
          return err("Pause the sequence to add, remove, or reorder steps.", 400);
        }
      }

      // Resolve sender for any step that didn't pick one — snapshot is NOT NULL.
      const needsDefault = data.steps.some((s) => !s.emailFromEmail || !s.emailFromName);
      let defaultSender: { name: string; email: string } | null = null;
      if (needsDefault) {
        defaultSender = await db.senderIdentity.findFirst({
          where: { workspaceId },
          orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
          select: { name: true, email: true },
        });
        if (!defaultSender) {
          return err("Add a Sender Identity in Settings before saving a sequence step.", 400);
        }
      }

      const incomingIds = new Set(data.steps.map((s) => s.id).filter(Boolean) as string[]);
      const toDelete = existing.steps.filter((s) => !incomingIds.has(s.id)).map((s) => s.id);

      await db.$transaction(async (tx) => {
        if (Object.keys(scalarUpdate).length > 0) {
          await tx.emailSequence.update({ where: { id }, data: scalarUpdate });
        }
        if (toDelete.length > 0) {
          await tx.sequenceStep.deleteMany({ where: { id: { in: toDelete } } });
        }
        for (let i = 0; i < data.steps!.length; i++) {
          const s = data.steps![i];
          const payload = {
            order:           i,
            delayMinutes:    s.delayMinutes,
            emailTemplateId: s.emailTemplateId ?? null,
            emailSubject:    s.emailSubject,
            emailHtmlBody:   s.emailHtmlBody,
            emailFromName:   s.emailFromName  || defaultSender!.name,
            emailFromEmail:  s.emailFromEmail || defaultSender!.email,
          };
          if (s.id) {
            await tx.sequenceStep.update({ where: { id: s.id }, data: payload });
          } else {
            await tx.sequenceStep.create({ data: { ...payload, sequenceId: id } });
          }
        }
      });
    } else if (Object.keys(scalarUpdate).length > 0) {
      await db.emailSequence.update({ where: { id }, data: scalarUpdate });
    }

    const fresh = await db.emailSequence.findUnique({
      where: { id },
      include: { steps: { orderBy: { order: "asc" } } },
    });
    return ok(fresh);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("sequences:delete");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { id } = await params;
    const existing = await db.emailSequence.findFirst({ where: { id, workspaceId } });
    if (!existing) return err("Sequence not found", 404);

    await db.emailSequence.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
