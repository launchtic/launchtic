import { db } from "@launchtic/database";
import TransactionsClient from "../../../../components/transactions/TransactionsClient";

import { requireWorkspaceFromSlug } from "../../../../lib/permissions";
export const metadata = { title: "Transactions" };

export default async function TransactionsPage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const { workspaceId } = await requireWorkspaceFromSlug(workspaceSlug);

  const total = await db.transaction.count({ where: { order: { workspaceId } } });

  return (
    <div className="flex flex-col h-full">
      <TransactionsClient initialTotal={total} />
    </div>
  );
}
