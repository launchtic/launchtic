import { db } from "@launchtic/database";
import SubscriptionsClient from "../../../../components/subscriptions/SubscriptionsClient";

import { requireWorkspaceFromSlug } from "../../../../lib/permissions";
export const metadata = { title: "Subscriptions" };

export default async function SubscriptionsPage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const { workspaceId } = await requireWorkspaceFromSlug(workspaceSlug);

  const total = await db.subscription.count({ where: { workspaceId } });

  return (
    <div className="flex flex-col h-full">
      <SubscriptionsClient initialTotal={total} />
    </div>
  );
}
