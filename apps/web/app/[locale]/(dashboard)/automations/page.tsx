import { auth } from "../../../../lib/auth";
import { redirect } from "next/navigation";
import { db } from "@launchtic/database";
import AutomationsList from "../../../../components/automations/AutomationsList";

export const metadata = { title: "Automations" };

export default async function AutomationsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const workspaceId = (session as any).workspaceId as string | null;
  if (!workspaceId) redirect("/login");

  const automations = await db.automation.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      triggerType: true,
      triggerConfig: true,
      timesTriggered: true,
      lastTriggeredAt: true,
      _count: { select: { actions: true } },
    },
  });

  return (
    <AutomationsList
      initial={automations.map((a) => ({
        ...a,
        triggerConfig: a.triggerConfig as Record<string, unknown>,
        lastTriggeredAt: a.lastTriggeredAt?.toISOString() ?? null,
        actionCount: a._count.actions,
      }))}
    />
  );
}
