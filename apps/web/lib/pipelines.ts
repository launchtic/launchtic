import { db } from "@launchtic/database";

// Rotating palette for stages created without an explicit color. Defined in a
// client-safe module so the picker UI can share the exact same palette.
export { STAGE_PALETTE, stageColor } from "./pipeline-colors";

// Stages the default "Sales" pipeline ships with — mirrors the systeme.io
// flow: cold lead → engaged → closing → terminal outcomes → nurture.
export const DEFAULT_STAGES: { name: string; color: string }[] = [
  { name: "New Leads",          color: "#6366f1" }, // indigo
  { name: "Shown Interest",     color: "#0ea5e9" }, // sky
  { name: "Ready to Close",     color: "#f59e0b" }, // amber
  { name: "Won",                color: "#16a34a" }, // green
  { name: "Lost",               color: "#ef4444" }, // red
  { name: "Long-term Follow-up", color: "#8b5cf6" }, // violet
];

// Returns the workspace's default pipeline, creating it (with default stages)
// on first access. One default pipeline per workspace.
export async function ensureDefaultPipeline(workspaceId: string) {
  const existing = await db.pipeline.findFirst({
    where: { workspaceId, isDefault: true },
    select: { id: true },
  });
  if (existing) return existing.id;

  const pipeline = await db.pipeline.create({
    data: {
      workspaceId,
      name: "Sales Pipeline",
      isDefault: true,
      position: 0,
      stages: {
        create: DEFAULT_STAGES.map((s, i) => ({
          name: s.name,
          color: s.color,
          position: i,
        })),
      },
    },
    select: { id: true },
  });
  return pipeline.id;
}

// Shape returned to the board UI. Cards carry a lightweight contact summary.
export async function getBoard(workspaceId: string, pipelineId: string) {
  const pipeline = await db.pipeline.findFirst({
    where: { id: pipelineId, workspaceId },
    include: {
      stages: {
        orderBy: { position: "asc" },
        include: {
          cards: {
            orderBy: { position: "asc" },
            include: {
              contact: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                  company: true,
                  tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!pipeline) return null;

  return {
    id: pipeline.id,
    name: pipeline.name,
    stages: pipeline.stages.map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      position: s.position,
      cards: s.cards.map((c) => ({
        id: c.id,
        contact: {
          id: c.contact.id,
          email: c.contact.email,
          firstName: c.contact.firstName,
          lastName: c.contact.lastName,
          company: c.contact.company,
          tags: c.contact.tags.map((ct) => ct.tag),
        },
      })),
    })),
  };
}

export type Board = NonNullable<Awaited<ReturnType<typeof getBoard>>>;

// Records a PIPELINE_STAGE_CHANGED activity event on the contact timeline when
// a contact enters a stage (manual board move/add). Looks up stage + pipeline
// names so the timeline reads "Sales → Won" without extra joins at render time.
// Best-effort: callers swallow errors so logging never breaks the move itself.
export async function logStageChange(params: {
  contactId: string;
  stageId: string;
  source: "manual" | "workflow";
}) {
  const stage = await db.pipelineStage.findUnique({
    where: { id: params.stageId },
    select: { id: true, name: true, pipelineId: true, pipeline: { select: { name: true } } },
  });
  if (!stage) return;

  await db.contactEvent.create({
    data: {
      contactId: params.contactId,
      type: "PIPELINE_STAGE_CHANGED",
      data: {
        pipelineId: stage.pipelineId,
        pipelineName: stage.pipeline.name,
        stageId: stage.id,
        stageName: stage.name,
        source: params.source,
      },
    },
  });
}
