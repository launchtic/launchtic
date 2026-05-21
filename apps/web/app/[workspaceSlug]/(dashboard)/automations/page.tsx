import { db } from "@launchtic/database";
import AutomationsList from "../../../../components/automations/AutomationsList";

import { requireWorkspaceFromSlug } from "../../../../lib/permissions";
export const metadata = { title: "Automations" };

export default async function AutomationsPage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const { workspaceId } = await requireWorkspaceFromSlug(workspaceSlug, "automations:read");

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
