import { notFound } from "next/navigation";
import { db } from "@launchtic/database";
import BroadcastDetail from "../../../../components/emails/BroadcastDetail";
import { ConfirmProvider } from "../../../../components/ui/ConfirmDialog";
import { ToastProvider } from "../../../../components/ui/Toast";
import { UnsavedChangesProvider } from "../../../../contexts/UnsavedChangesContext";
import { requireWorkspaceFromSlug } from "../../../../lib/permissions";

export const metadata = { title: "Broadcast" };

type PageProps = { params: Promise<{ id: string; workspaceSlug: string }> };

// Full-screen broadcast editor — outside the (dashboard) group so the builder
// gets the whole viewport, mirroring the email template editor.
export default async function BroadcastEditorPage({ params }: PageProps) {
  const { workspaceSlug } = await params;
  const { workspaceId } = await requireWorkspaceFromSlug(workspaceSlug, "broadcasts:read");

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
    <ToastProvider>
      <ConfirmProvider>
        <UnsavedChangesProvider>
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
              totalRecipients: broadcast.totalRecipients,
              sentCount: broadcast.sentCount,
              failedCount: broadcast.failedCount,
            }}
            tags={tags.map((t) => ({ id: t.id, name: t.name, color: t.color, count: t._count.contacts }))}
            templates={templates}
            senderIdentities={senderIdentities}
          />
        </UnsavedChangesProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
