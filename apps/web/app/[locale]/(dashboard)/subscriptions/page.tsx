import { auth } from "../../../../lib/auth";
import { redirect } from "next/navigation";
import { db } from "@launchtic/database";
import SubscriptionsClient from "../../../../components/subscriptions/SubscriptionsClient";

export const metadata = { title: "Subscriptions" };

export default async function SubscriptionsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const workspaceId = (session as any).workspaceId as string | null;
  if (!workspaceId) redirect("/login");

  const total = await db.subscription.count({ where: { workspaceId } });

  return (
    <div className="flex flex-col h-full">
      <SubscriptionsClient initialTotal={total} />
    </div>
  );
}
