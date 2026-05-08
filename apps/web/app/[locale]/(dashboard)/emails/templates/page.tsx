import { auth } from "../../../../../lib/auth";
import { redirect } from "next/navigation";
import { db } from "@launchtic/database";
import TemplatesList from "../../../../../components/emails/TemplatesList";

export const metadata = { title: "Email Templates" };

export default async function EmailTemplatesPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const workspaceId = (session as any).workspaceId as string | null;
  if (!workspaceId) redirect("/login");

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
