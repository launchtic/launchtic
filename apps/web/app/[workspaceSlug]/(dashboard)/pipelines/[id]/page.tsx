import { notFound } from "next/navigation";
import { requireWorkspaceFromSlug } from "../../../../../lib/permissions";
import { getBoard } from "../../../../../lib/pipelines";
import PipelineDetailClient from "../../../../../components/pipelines/PipelineDetailClient";

export const metadata = { title: "Pipeline" };

export default async function PipelineDetailPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; id: string }>;
}) {
  const { workspaceSlug, id } = await params;
  const { workspaceId } = await requireWorkspaceFromSlug(workspaceSlug, "pipelines:read");

  const board = await getBoard(workspaceId, id);
  if (!board) notFound();

  return (
    <div className="flex flex-col h-full">
      <PipelineDetailClient initialBoard={board} />
    </div>
  );
}
