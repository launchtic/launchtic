import { db } from "@launchtic/database";
import TemplatesList from "../../../../../components/emails/TemplatesList";

import { requireWorkspaceFromSlug } from "../../../../../lib/permissions";
export const metadata = { title: "Email Templates" };

export default async function EmailTemplatesPage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const { workspaceId } = await requireWorkspaceFromSlug(workspaceSlug, "email_templates:read");

  const templates = await db.emailTemplate.findMany({
    where: { workspaceId },
    orderBy: [{ isSystem: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      name: true,
      subject: true,
      category: true,
      isSystem: true,
      systemKey: true,
      updatedAt: true,
    },
  });

  return (
    <TemplatesList
      initial={templates.map((t) => ({
        ...t,
        updatedAt: t.updatedAt.toISOString(),
      }))}
    />
  );
}
