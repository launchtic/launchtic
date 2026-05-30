import { db } from "@launchtic/database";
import { notFound } from "next/navigation";
import WorkflowBuilder from "../../../../../components/workflows/WorkflowBuilder";
import { requireWorkspaceFromSlug } from "../../../../../lib/permissions";

export const metadata = { title: "Workflow editor" };

export default async function WorkflowEditorPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; id: string }>;
}) {
  const { workspaceSlug, id } = await params;
  const { workspaceId } = await requireWorkspaceFromSlug(workspaceSlug, "automations:read");

  const wf = await db.workflow.findFirst({
    where: { id, workspaceId },
  });
  if (!wf) notFound();

  // Load tags for the ADD_TAG / REMOVE_TAG node pickers, sender identities
  // for SEND_EMAIL, funnels for trigger scope. Cheap one-shot at editor open.
  const [tags, senders, funnels] = await Promise.all([
    db.tag.findMany({
      where: { workspaceId }, orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    }),
    db.senderIdentity.findMany({
      where: { workspaceId }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: { id: true, name: true, email: true, isDefault: true },
    }),
    db.funnel.findMany({
      where: { workspaceId }, orderBy: { name: "asc" },
      select: {
        id: true, name: true,
        steps: { select: { id: true, name: true, type: true }, orderBy: { order: "asc" } },
      },
    }),
  ]);

  return (
    <WorkflowBuilder
      workflow={{
        id: wf.id,
        name: wf.name,
        description: wf.description,
        status: wf.status,
        triggerType: wf.triggerType,
        triggerConfig: (wf.triggerConfig as Record<string, unknown> | null) ?? {},
        nodes: (wf.nodes as unknown as { id: string; type: any; position?: { x: number; y: number }; config?: Record<string, unknown> }[]) ?? [],
        edges: (wf.edges as unknown as { id: string; source: string; target: string; label?: string; weight?: number }[]) ?? [],
        startNodeId: wf.startNodeId,
        reEnrollPolicy: wf.reEnrollPolicy,
        reEnrollCooldownDays: wf.reEnrollCooldownDays,
        maxDurationDays: wf.maxDurationDays,
      }}
      tags={tags}
      senders={senders}
      funnels={funnels}
    />
  );
}
