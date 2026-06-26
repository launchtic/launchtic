import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { z } from "zod";
import { ok, err, handleError } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";
import { getBoard, stageColor } from "../../../../lib/pipelines";

type Params = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  // Ordered stage list. Rows with an `id` are updated; rows without are
  // created; existing stages absent from the list are deleted (cards cascade).
  stages: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().trim().min(1).max(60),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      }),
    )
    .min(1)
    .max(20)
    .optional(),
});

// Full board: stages + cards + contact summaries.
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("pipelines:read");
    if (!r.ok) return r.response;

    const { id } = await params;
    const board = await getBoard(r.workspaceId, id);
    if (!board) return err("Pipeline not found", 404);

    return ok(board);
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("pipelines:write");
    if (!r.ok) return r.response;

    const { id } = await params;
    const { name, stages } = updateSchema.parse(await req.json());

    const owned = await db.pipeline.findFirst({
      where: { id, workspaceId: r.workspaceId },
      select: { id: true, stages: { select: { id: true } } },
    });
    if (!owned) return err("Pipeline not found", 404);

    if (!stages) {
      await db.pipeline.update({ where: { id }, data: { name } });
      return ok({ id, name });
    }

    // Reconcile stages against the submitted ordered list.
    const existingIds = new Set(owned.stages.map((s) => s.id));
    const keepIds = new Set(stages.filter((s) => s.id).map((s) => s.id!));
    const toDelete = [...existingIds].filter((sid) => !keepIds.has(sid));

    await db.$transaction([
      db.pipeline.update({ where: { id }, data: { name } }),
      ...stages.map((s, i) =>
        s.id && existingIds.has(s.id)
          ? db.pipelineStage.update({
              where: { id: s.id },
              data: { name: s.name, position: i, ...(s.color ? { color: s.color } : {}) },
            })
          : db.pipelineStage.create({
              data: { pipelineId: id, name: s.name, position: i, color: s.color ?? stageColor(i) },
            }),
      ),
      ...(toDelete.length ? [db.pipelineStage.deleteMany({ where: { id: { in: toDelete } } })] : []),
    ]);

    const board = await getBoard(r.workspaceId, id);
    return ok(board);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("pipelines:delete");
    if (!r.ok) return r.response;

    const { id } = await params;
    const { workspaceId } = r;

    const pipeline = await db.pipeline.findFirst({
      where: { id, workspaceId },
      select: { id: true, isDefault: true },
    });
    if (!pipeline) return err("Pipeline not found", 404);

    // A workspace must always keep at least one pipeline.
    const count = await db.pipeline.count({ where: { workspaceId } });
    if (count <= 1) return err("You must keep at least one pipeline", 400);

    await db.pipeline.delete({ where: { id } });

    // If we removed the default, promote the next pipeline so one stays default.
    if (pipeline.isDefault) {
      const next = await db.pipeline.findFirst({
        where: { workspaceId },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: { id: true },
      });
      if (next) await db.pipeline.update({ where: { id: next.id }, data: { isDefault: true } });
    }

    return ok({ id });
  } catch (error) {
    return handleError(error);
  }
}
