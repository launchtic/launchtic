import { db } from "@launchtic/database";
import { notFound } from "next/navigation";
import WorkflowEmailEditor from "../../../../../components/workflows/WorkflowEmailEditor";
import { ToastProvider } from "../../../../../components/ui/Toast";
import { requireWorkspaceFromSlug } from "../../../../../lib/permissions";

export const metadata = { title: "New workflow email" };

// Create-mode entry point — no DB row until Save. Full-screen (outside the
// dashboard group), same as the edit route.
export default async function NewWorkflowEmailPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; id: string }>;
}) {
  const { workspaceSlug, id } = await params;
  const { workspaceId } = await requireWorkspaceFromSlug(workspaceSlug, "workflows:write");

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
    <ToastProvider>
      <WorkflowEmailEditor
        workspaceSlug={workspaceSlug}
        workflow={workflow}
        email={null}
        senders={senders}
        templates={templates}
      />
    </ToastProvider>
  );
}
