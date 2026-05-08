import { auth } from "../../../../lib/auth";
import { redirect } from "next/navigation";
import { db } from "@launchtic/database";
import OrdersClient from "../../../../components/orders/OrdersClient";

export const metadata = { title: "Orders" };

export default async function OrdersPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const workspaceId = (session as any).workspaceId as string | null;
  if (!workspaceId) redirect("/login");

  const totalOrders = await db.order.count({ where: { workspaceId } });

  return (
    <div className="flex flex-col h-full">
      <OrdersClient initialTotal={totalOrders} />
    </div>
  );
}
