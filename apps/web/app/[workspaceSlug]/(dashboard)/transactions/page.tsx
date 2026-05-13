import { auth } from "../../../../lib/auth";
import { redirect } from "next/navigation";
import { db } from "@launchtic/database";
import TransactionsClient from "../../../../components/transactions/TransactionsClient";

export const metadata = { title: "Transactions" };

export default async function TransactionsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const workspaceId = (session as any).workspaceId as string | null;
  if (!workspaceId) redirect("/login");

  const total = await db.transaction.count({ where: { order: { workspaceId } } });

  return (
    <div className="flex flex-col h-full">
      <TransactionsClient initialTotal={total} />
    </div>
  );
}
