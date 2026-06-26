import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { z } from "zod";
import { ok, err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";

type Params = { params: Promise<{ id: string }> };

const createStageSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

// Add a stage to the end of the pipeline's columns.
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("pipelines:write");
    if (!r.ok) return r.response;

    const { id: pipelineId } = await params;
    const { name, color } = createStageSchema.parse(await req.json());

    const pipeline = await db.pipeline.findFirst({
      where: { id: pipelineId, workspaceId: r.workspaceId },
      select: { id: true },
    });
    if (!pipeline) return err("Pipeline not found", 404);

    const last = await db.pipelineStage.findFirst({
      where: { pipelineId },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const stage = await db.pipelineStage.create({
      data: { pipelineId, name, color, position: (last?.position ?? -1) + 1 },
      select: { id: true, name: true, color: true, position: true },
    });

    return ok({ ...stage, cards: [] }, 201);
  } catch (error) {
    return handleError(error);
  }
}
