import { notFound } from "next/navigation";
import { db } from "@launchtic/database";
import TemplateEditor from "../../../../../../components/emails/TemplateEditor";

import { requireWorkspaceFromSlug } from "../../../../../../lib/permissions";
export const metadata = { title: "Edit Email Template" };

type PageProps = { params: Promise<{ id: string; workspaceSlug: string }> };

export default async function EditTemplatePage({ params }: PageProps) {
  const { workspaceSlug } = await params;
  const { workspaceId } = await requireWorkspaceFromSlug(workspaceSlug);

  const { id } = await params;
  const template = await db.emailTemplate.findFirst({ where: { id, workspaceId } });
  if (!template) notFound();

  return (
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
  );
}
