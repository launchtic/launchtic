import { db } from "@launchtic/database";
import OrdersClient from "../../../../components/orders/OrdersClient";

import { requireWorkspaceFromSlug } from "../../../../lib/permissions";
export const metadata = { title: "Orders" };

export default async function OrdersPage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const { workspaceId } = await requireWorkspaceFromSlug(workspaceSlug);

  const totalOrders = await db.order.count({ where: { workspaceId } });

  return (
    <div className="flex flex-col h-full">
      <OrdersClient initialTotal={totalOrders} />
    </div>
  );
}
