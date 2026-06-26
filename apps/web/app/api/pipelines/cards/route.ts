import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { z } from "zod";
import { ok, err, handleError } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";

const addCardSchema = z.object({
  stageId: z.string().min(1),
  contactId: z.string().min(1),
});

// Add a contact to a stage. A contact can only sit on one stage per pipeline,
// so if it's already on this pipeline we move the existing card instead.
export async function POST(req: NextRequest) {
  try {
    const r = await requireAccess("pipelines:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { stageId, contactId } = addCardSchema.parse(await req.json());

    const [stage, contact] = await Promise.all([
      db.pipelineStage.findFirst({
        where: { id: stageId, pipeline: { workspaceId } },
        select: { id: true, pipelineId: true },
      }),
      db.contact.findFirst({ where: { id: contactId, workspaceId }, select: { id: true } }),
    ]);
    if (!stage) return err("Stage not found", 404);
    if (!contact) return err("Contact not found", 404);

    const existing = await db.pipelineCard.findFirst({
      where: { contactId, stage: { pipelineId: stage.pipelineId } },
      select: { id: true, stageId: true },
    });

    const last = await db.pipelineCard.findFirst({
      where: { stageId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const position = (last?.position ?? -1) + 1;

    if (existing) {
      if (existing.stageId === stageId) return ok({ id: existing.id, moved: false });
      const card = await db.pipelineCard.update({
        where: { id: existing.id },
        data: { stageId, position },
        select: { id: true },
      });
      return ok({ id: card.id, moved: true });
    }

    const card = await db.pipelineCard.create({
      data: { stageId, contactId, position },
      select: { id: true },
    });
    return ok({ id: card.id, moved: false }, 201);
  } catch (error) {
    return handleError(error);
  }
}
