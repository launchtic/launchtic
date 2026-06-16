import { notFound } from "next/navigation";
import { db } from "@launchtic/database";
import TemplateEditor from "../../../../components/emails/TemplateEditor";
import { ConfirmProvider } from "../../../../components/ui/ConfirmDialog";
import { requireWorkspaceFromSlug } from "../../../../lib/permissions";

export const metadata = { title: "Edit Email Template" };

type PageProps = { params: Promise<{ id: string; workspaceSlug: string }> };

// Full-screen email editor — lives OUTSIDE the (dashboard) group so the builder
// gets the whole viewport (no app sidebar/topnav), mirroring the landing-page
// editor at /[workspaceSlug]/page-template-editor/[id].
export default async function EditTemplatePage({ params }: PageProps) {
  const { workspaceSlug } = await params;
  const { workspaceId } = await requireWorkspaceFromSlug(workspaceSlug, "email_templates:read");

  const { id } = await params;
  const template = await db.emailTemplate.findFirst({ where: { id, workspaceId } });
  if (!template) notFound();

  return (
    <ConfirmProvider>
      <TemplateEditor
        initial={{
          id: template.id,
          name: template.name,
          subject: template.subject,
          htmlBody: template.htmlBody,
          category: template.category,
          isSystem: template.isSystem,
          systemKey: template.systemKey,
        }}
      />
    </ConfirmProvider>
  );
}
