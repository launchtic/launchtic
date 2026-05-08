import { auth } from "../../../../../../lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@launchtic/database";
import BroadcastDetail from "../../../../../../components/emails/BroadcastDetail";

export const metadata = { title: "Broadcast" };

type PageProps = { params: Promise<{ id: string }> };

export default async function BroadcastDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session) redirect("/login");
  const workspaceId = (session as any).workspaceId as string | null;
  if (!workspaceId) redirect("/login");

  const { id } = await params;
  const [broadcast, tags, templates, senderIdentities] = await Promise.all([
    db.broadcast.findFirst({ where: { id, workspaceId } }),
    db.tag.findMany({
      where: { workspaceId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true, _count: { select: { contacts: true } } },
    }),
    db.emailTemplate.findMany({
      where: { workspaceId },
      orderBy: [{ isSystem: "desc" }, { updatedAt: "desc" }],
      select: { id: true, name: true, subject: true, htmlBody: true, category: true },
    }),
    db.senderIdentity.findMany({
      where: { workspaceId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: { id: true, name: true, email: true, isDefault: true },
    }),
  ]);
  if (!broadcast) notFound();

  return (
    <BroadcastDetail
      initial={{
        id: broadcast.id,
        name: broadcast.name,
        subject: broadcast.subject,
        htmlBody: broadcast.htmlBody,
        templateId: broadcast.templateId,
        fromEmail: broadcast.fromEmail,
        fromName: broadcast.fromName,
        status: broadcast.status,
        scheduledAt: broadcast.scheduledAt?.toISOString() ?? null,
        sentAt: broadcast.sentAt?.toISOString() ?? null,
        targetType: broadcast.targetType,
        targetTagIds: broadcast.targetTagIds,
        excludeUnsubscribed: broadcast.excludeUnsubscribed,
        totalRecipients: broadcast.totalRecipients,
        sentCount: broadcast.sentCount,
        failedCount: broadcast.failedCount,
      }}
      tags={tags.map((t) => ({ id: t.id, name: t.name, color: t.color, count: t._count.contacts }))}
      templates={templates}
      senderIdentities={senderIdentities}
    />
  );
}
