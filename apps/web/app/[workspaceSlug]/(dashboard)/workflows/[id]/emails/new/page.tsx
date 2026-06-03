// Create-mode entry point for the workflow email editor.
//
// The route exists separately from /emails/[emailId]/edit so the editor
// component can render a blank form without an emailId. A WorkflowEmail
// row is only inserted in the database when the operator clicks Save —
// abandoning the page leaves no orphan rows.

import { db } from "@launchtic/database";
import { notFound } from "next/navigation";
import WorkflowEmailEditor from "../../../../../../../components/workflows/WorkflowEmailEditor";
import { requireWorkspaceFromSlug } from "../../../../../../../lib/permissions";

export const metadata = { title: "New workflow email" };

export default async function NewWorkflowEmailPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; id: string }>;
}) {
  const { workspaceSlug, id } = await params;
  const { workspaceId } = await requireWorkspaceFromSlug(workspaceSlug, "automations:write");

  const [workflow, senders, templates] = await Promise.all([
    db.workflow.findFirst({
      where:  { id, workspaceId },
      select: { id: true, name: true, status: true },
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
  if (!workflow) notFound();

  return (
    <WorkflowEmailEditor
      workspaceSlug={workspaceSlug}
      workflow={workflow}
      email={null}
      senders={senders}
      templates={templates}
    />
  );
}
