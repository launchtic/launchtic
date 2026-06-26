import { db } from "@launchtic/database";
import { requireWorkspaceFromSlug } from "../../../../lib/permissions";
import { ensureDefaultPipeline } from "../../../../lib/pipelines";
import PipelinesListClient from "../../../../components/pipelines/PipelinesListClient";

export const metadata = { title: "Pipelines" };

export default async function PipelinesPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const { workspaceId } = await requireWorkspaceFromSlug(workspaceSlug, "pipelines:read");

  await ensureDefaultPipeline(workspaceId);

  const pipelines = await db.pipeline.findMany({
    where: { workspaceId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, isDefault: true, createdAt: true, _count: { select: { stages: true } } },
  });

  const contactCounts = await Promise.all(
    pipelines.map((p) => db.pipelineCard.count({ where: { stage: { pipelineId: p.id } } })),
  );

  const items = pipelines.map((p, i) => ({
    id: p.id,
    name: p.name,
    isDefault: p.isDefault,
    stageCount: p._count.stages,
    contactCount: contactCounts[i],
    createdAt: p.createdAt.toISOString(),
  }));

  return (
    <div className="flex flex-col h-full">
      <PipelinesListClient items={items} />
    </div>
  );
}
