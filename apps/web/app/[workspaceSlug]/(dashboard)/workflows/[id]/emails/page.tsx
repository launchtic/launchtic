// Listing page for all WorkflowEmail rows belonging to a workflow.
// Reached from the workflow editor's top bar "Emails" link, lets the
// operator audit + delete orphans + jump into the dedicated editor for any
// row.
//
// Usage count = how many SEND_EMAIL nodes in the workflow's `nodes` JSON
// reference this email by emailId. Computed server-side once per page load
// so the table can show "Unused" for orphans the operator can safely delete.

import { db } from "@launchtic/database";
import { notFound } from "next/navigation";
import WorkflowEmailList from "../../../../../../components/workflows/WorkflowEmailList";
import { requireWorkspaceFromSlug } from "../../../../../../lib/permissions";

export const metadata = { title: "Workflow emails" };

type NodeMini = { type?: string; config?: { emailId?: string | null } };

export default async function WorkflowEmailListPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; id: string }>;
}) {
  const { workspaceSlug, id } = await params;
  const { workspaceId } = await requireWorkspaceFromSlug(workspaceSlug, "automations:read");

  const [workflow, emails] = await Promise.all([
    db.workflow.findFirst({
      where:  { id, workspaceId },
      select: { id: true, name: true, nodes: true },
    }),
    db.workflowEmail.findMany({
      where:   { workflowId: id },
      orderBy: { createdAt: "desc" },
      select:  {
        id: true, subject: true, fromName: true, fromEmail: true,
        sentCount: true, openedCount: true, clickedCount: true,
        createdAt: true,
      },
    }),
  ]);
  if (!workflow) notFound();

  // Walk the workflow's `nodes` JSON, tally how many SEND_EMAIL nodes
  // reference each emailId. The operator uses this column to spot orphans
  // (count 0 = safe to delete).
  const usage = new Map<string, number>();
  const nodes = (workflow.nodes as unknown as NodeMini[]) ?? [];
  for (const n of nodes) {
    if (n.type === "SEND_EMAIL") {
      const eid = n.config?.emailId;
      if (typeof eid === "string" && eid) usage.set(eid, (usage.get(eid) ?? 0) + 1);
    }
  }

  return (
    <WorkflowEmailList
      workspaceSlug={workspaceSlug}
      workflow={{ id: workflow.id, name: workflow.name }}
      emails={emails.map((e) => ({
        id:           e.id,
        subject:      e.subject,
        fromName:     e.fromName,
        fromEmail:    e.fromEmail,
        sentCount:    e.sentCount,
        openedCount:  e.openedCount,
        clickedCount: e.clickedCount,
        createdAt:    e.createdAt.toISOString(),
        usageCount:   usage.get(e.id) ?? 0,
      }))}
    />
  );
}
