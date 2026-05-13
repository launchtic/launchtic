import { auth } from "../../../../../../lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@launchtic/database";
import TemplateEditor from "../../../../../../components/emails/TemplateEditor";

export const metadata = { title: "Edit Email Template" };

type PageProps = { params: Promise<{ id: string }> };

export default async function EditTemplatePage({ params }: PageProps) {
  const session = await auth();
  if (!session) redirect("/login");

  const workspaceId = (session as any).workspaceId as string | null;
  if (!workspaceId) redirect("/login");

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
