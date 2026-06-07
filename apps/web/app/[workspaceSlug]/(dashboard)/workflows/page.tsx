import { db } from "@launchtic/database";
import WorkflowsList from "../../../../components/workflows/WorkflowsList";
import { requireWorkspaceFromSlug } from "../../../../lib/permissions";

export const metadata = { title: "Workflows" };

export default async function WorkflowsPage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const { workspaceId } = await requireWorkspaceFromSlug(workspaceSlug, "workflows:read");

  const workflows = await db.workflow.findMany({
    where:   { workspaceId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true, name: true, description: true, status: true,
      triggerType: true, triggerConfig: true, startNodeId: true,
      totalEnrolled: true, activeCount: true, completedCount: true,
      lastTriggeredAt: true, updatedAt: true,
      nodes: true,  // for node count
    },
  });

  return (
    <WorkflowsList
      initial={workflows.map((w) => ({
        id: w.id,
        name: w.name,
        description: w.description,
        status: w.status,
        triggerType: w.triggerType,
        triggerConfig: w.triggerConfig as Record<string, unknown> | null,
        hasStartNode: !!w.startNodeId,
        totalEnrolled: w.totalEnrolled,
        activeCount: w.activeCount,
        completedCount: w.completedCount,
        nodeCount: Array.isArray(w.nodes) ? (w.nodes as unknown[]).length : 0,
        lastTriggeredAt: w.lastTriggeredAt?.toISOString() ?? null,
        updatedAt: w.updatedAt.toISOString(),
      }))}
    />
  );
}
