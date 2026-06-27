import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { z } from "zod";
import { ok, err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";
import { logStageChange } from "../../../../../lib/pipelines";

type Params = { params: Promise<{ cardId: string }> };

// Move a card: target stage + new position within that stage. Both are sent
// together by the Kanban drag handler.
const moveSchema = z.object({
  stageId: z.string().min(1),
  position: z.number().int().min(0),
});

async function ownedCard(cardId: string, workspaceId: string) {
  return db.pipelineCard.findFirst({
    where: { id: cardId, stage: { pipeline: { workspaceId } } },
    select: { id: true, stageId: true, contactId: true, stage: { select: { pipelineId: true } } },
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("pipelines:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { cardId } = await params;
    const { stageId, position } = moveSchema.parse(await req.json());

    const card = await ownedCard(cardId, workspaceId);
    if (!card) return err("Card not found", 404);

    // Target stage must be in the SAME pipeline (cards don't jump pipelines).
    const target = await db.pipelineStage.findFirst({
      where: { id: stageId, pipelineId: card.stage.pipelineId },
      select: { id: true },
    });
    if (!target) return err("Target stage not found in this pipeline", 404);

    await db.pipelineCard.update({ where: { id: cardId }, data: { stageId, position } });

    // Log only a genuine stage change — a same-stage reorder isn't a milestone.
    if (card.stageId !== stageId) {
      await logStageChange({ contactId: card.contactId, stageId, source: "manual" }).catch(() => {});
    }
    return ok({ id: cardId, stageId, position });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("pipelines:write");
    if (!r.ok) return r.response;

    const { cardId } = await params;
    const card = await ownedCard(cardId, r.workspaceId);
    if (!card) return err("Card not found", 404);

    await db.pipelineCard.delete({ where: { id: cardId } });
    return ok({ id: cardId });
  } catch (error) {
    return handleError(error);
  }
}
