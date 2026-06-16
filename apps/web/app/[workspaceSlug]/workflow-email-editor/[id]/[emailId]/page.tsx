import { db } from "@launchtic/database";
import { notFound } from "next/navigation";
import WorkflowEmailEditor from "../../../../../components/workflows/WorkflowEmailEditor";
import { ToastProvider } from "../../../../../components/ui/Toast";
import { requireWorkspaceFromSlug } from "../../../../../lib/permissions";

export const metadata = { title: "Workflow email editor" };

// Full-screen workflow email editor — outside the (dashboard) group so the
// builder gets the whole viewport, mirroring the email template editor.
export default async function WorkflowEmailEditorPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; id: string; emailId: string }>;
}) {
  const { workspaceSlug, id, emailId } = await params;
  const { workspaceId } = await requireWorkspaceFromSlug(workspaceSlug, "workflows:read");

  const [workflow, email, senders, templates] = await Promise.all([
    db.workflow.findFirst({
      where:  { id, workspaceId },
      select: { id: true, name: true, status: true },
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
    <ToastProvider>
      <WorkflowEmailEditor
        workspaceSlug={workspaceSlug}
        workflow={workflow}
        email={email}
        senders={senders}
        templates={templates}
      />
    </ToastProvider>
  );
}
