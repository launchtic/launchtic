import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { z } from "zod";
import { ok, handleError } from "../../../lib/api";
import { requireAccess } from "../../../lib/permissions";
import { DEFAULT_STAGES, stageColor } from "../../../lib/pipelines";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  // Custom stages from the create dialog (ordered). Falls back to defaults.
  stages: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(60),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      }),
    )
    .min(1)
    .max(20)
    .optional(),
});

// List the workspace's pipelines (id + name only, for the board switcher).
// Guarantees a default pipeline exists on first access.
export async function GET() {
  try {
    const r = await requireAccess("pipelines:read");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const pipelines = await db.pipeline.findMany({
      where: { workspaceId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true },
    });

    return ok({ pipelines });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const r = await requireAccess("pipelines:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { name, stages } = createSchema.parse(await req.json());

    const count = await db.pipeline.count({ where: { workspaceId } });
    const source = stages?.length ? stages : DEFAULT_STAGES;

    const pipeline = await db.pipeline.create({
      data: {
        workspaceId,
        name,
        position: count,
        stages: {
          create: source.map((s, i) => ({
            name: s.name,
            color: s.color ?? stageColor(i),
            position: i,
          })),
        },
      },
      select: { id: true, name: true },
    });

    return ok(pipeline, 201);
  } catch (error) {
    return handleError(error);
  }
}
