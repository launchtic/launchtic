import { auth } from "../../../../../lib/auth";
import { redirect } from "next/navigation";
import { db } from "@launchtic/database";
import BroadcastsList from "../../../../../components/emails/BroadcastsList";

export const metadata = { title: "Broadcasts" };

export default async function BroadcastsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const workspaceId = (session as any).workspaceId as string | null;
  if (!workspaceId) redirect("/login");

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
