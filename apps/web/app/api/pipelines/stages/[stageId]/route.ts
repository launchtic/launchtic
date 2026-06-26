import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { z } from "zod";
import { ok, err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";

type Params = { params: Promise<{ stageId: string }> };

const updateStageSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  position: z.number().int().min(0).optional(),
});

async function ownedStage(stageId: string, workspaceId: string) {
  return db.pipelineStage.findFirst({
    where: { id: stageId, pipeline: { workspaceId } },
    select: { id: true, pipelineId: true },
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("pipelines:write");
    if (!r.ok) return r.response;

    const { stageId } = await params;
    const data = updateStageSchema.parse(await req.json());

    const stage = await ownedStage(stageId, r.workspaceId);
    if (!stage) return err("Stage not found", 404);

    const updated = await db.pipelineStage.update({
      where: { id: stageId },
      data,
      select: { id: true, name: true, color: true, position: true },
    });

    return ok(updated);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("pipelines:write");
    if (!r.ok) return r.response;

    const { stageId } = await params;
    const stage = await ownedStage(stageId, r.workspaceId);
    if (!stage) return err("Stage not found", 404);

    // Refuse to delete the last column — a pipeline needs somewhere to drop cards.
    const remaining = await db.pipelineStage.count({ where: { pipelineId: stage.pipelineId } });
    if (remaining <= 1) return err("A pipeline must keep at least one stage", 400);

    // Cascade removes the stage's cards (contacts themselves are untouched).
    await db.pipelineStage.delete({ where: { id: stageId } });
    return ok({ id: stageId });
  } catch (error) {
    return handleError(error);
  }
}
