import { auth } from "../../../../lib/auth";
import { redirect } from "next/navigation";
import { db } from "@launchtic/database";
import FunnelsClient from "../../../../components/funnels/FunnelsClient";

export const metadata = { title: "Funnels" };

export default async function FunnelsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const workspaceId = (session as any).workspaceId as string | null;
  const total = workspaceId
    ? await db.funnel.count({ where: { workspaceId, status: "ACTIVE" } })
    : 0;

  return (
    <div className="flex flex-col h-full">
      <FunnelsClient initialTotal={total} />
    </div>
  );
}
