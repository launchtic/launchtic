import { db } from "@launchtic/database";
import BroadcastsList from "../../../../../components/emails/BroadcastsList";

import { requireWorkspaceFromSlug } from "../../../../../lib/permissions";
export const metadata = { title: "Broadcasts" };

export default async function BroadcastsPage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const { workspaceId } = await requireWorkspaceFromSlug(workspaceSlug);

  const broadcasts = await db.broadcast.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      subject: true,
      status: true,
      scheduledAt: true,
      sentAt: true,
      targetType: true,
      targetTagIds: true,
      totalRecipients: true,
      sentCount: true,
      failedCount: true,
      createdAt: true,
    },
  });

  return (
    <BroadcastsList
      initial={broadcasts.map((b) => ({
        ...b,
        scheduledAt: b.scheduledAt?.toISOString() ?? null,
        sentAt: b.sentAt?.toISOString() ?? null,
        createdAt: b.createdAt.toISOString(),
      }))}
    />
  );
}
