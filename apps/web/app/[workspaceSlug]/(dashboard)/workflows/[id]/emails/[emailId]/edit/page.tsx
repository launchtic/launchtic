// Dedicated fullscreen editor for a single WorkflowEmail. Reached from the
// workflow builder's SEND_EMAIL config modal via the Edit / Create CTA.
// Same maily.to surface broadcasts use; data persists via the existing
// /api/workflows/[id]/emails/[emailId] PATCH endpoint.

import { db } from "@launchtic/database";
import { notFound } from "next/navigation";
import WorkflowEmailEditor from "../../../../../../../../components/workflows/WorkflowEmailEditor";
import { requireWorkspaceFromSlug } from "../../../../../../../../lib/permissions";

export const metadata = { title: "Workflow email editor" };

export default async function WorkflowEmailEditorPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; id: string; emailId: string }>;
}) {
  const { workspaceSlug, id, emailId } = await params;
  const { workspaceId } = await requireWorkspaceFromSlug(workspaceSlug, "automations:read");

  // Ownership chain — workflow must belong to the workspace + email must
  // belong to that workflow. Either miss = 404 to avoid id-probe leaks.
  // Templates are workspace-scoped (mirrors broadcast) so the operator can
  // start a workflow email from any saved template.
  const [workflow, email, senders, templates] = await Promise.all([
    db.workflow.findFirst({
      where:  { id, workspaceId },
      select: { id: true, name: true },
    }),
    db.workflowEmail.findFirst({
      where:  { id: emailId, workflowId: id, workspaceId },
      select: {
        id: true, name: true, subject: true, bodyHtml: true,
        fromName: true, fromEmail: true, senderId: true,
      },
    }),
    db.senderIdentity.findMany({
      where:   { workspaceId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select:  { id: true, name: true, email: true, isDefault: true },
    }),
    db.emailTemplate.findMany({
      where:   { workspaceId },
      orderBy: [{ isSystem: "desc" }, { updatedAt: "desc" }],
      select:  { id: true, name: true, category: true },
    }),
  ]);
  if (!workflow || !email) notFound();

  return (
    <WorkflowEmailEditor
      workspaceSlug={workspaceSlug}
      workflow={workflow}
      email={email}
      senders={senders}
      templates={templates}
    />
  );
}
