import { auth } from "../../../../lib/auth";
import { redirect } from "next/navigation";
import { db } from "@launchtic/database";
import DashboardClient from "../../../../components/dashboard/DashboardClient";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const workspaceId = (session as any).workspaceId as string | null;
  if (!workspaceId) redirect("/login");

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [revenueResult, orders30d, newContacts30d, activeSubscriptions, totalFunnels, recentOrders] =
    await Promise.all([
      db.order.aggregate({
        where: { workspaceId, status: "PAID", createdAt: { gte: thirtyDaysAgo } },
        _sum: { total: true },
      }),
      db.order.count({ where: { workspaceId, createdAt: { gte: thirtyDaysAgo } } }),
      db.contact.count({ where: { workspaceId, createdAt: { gte: thirtyDaysAgo } } }),
      db.subscription.count({ where: { workspaceId, status: "ACTIVE" } }),
      db.funnel.count({ where: { workspaceId, status: "ACTIVE" } }),
      db.order.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          contact: { select: { email: true, firstName: true, lastName: true } },
          funnelStep: { select: { name: true, funnel: { select: { name: true } } } },
        },
      }),
    ]);

  const stats = {
    revenue30d: revenueResult._sum.total ?? 0,
    orders30d,
    newContacts30d,
    activeSubscriptions,
    totalFunnels,
    recentOrders: recentOrders.map((o) => ({
      id: o.id,
      status: o.status,
      total: o.total,
      currency: o.currency,
      createdAt: o.createdAt.toISOString(),
      contact: o.contact,
      funnelName: o.funnelStep?.funnel.name ?? null,
    })),
  };

  return (
    <div className="flex flex-col h-full">
      <DashboardClient stats={stats} workspaceName={(session as any).workspaceName ?? ""} />
    </div>
  );
}
