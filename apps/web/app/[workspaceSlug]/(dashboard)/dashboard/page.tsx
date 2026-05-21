import { db } from "@launchtic/database";
import DashboardClient from "../../../../components/dashboard/DashboardClient";
import { requireWorkspaceFromSlug } from "../../../../lib/permissions";

export const metadata = { title: "Dashboard" };

// Dashboard has no top-level permission gate — every workspace member can
// reach this page. The page itself filters cards per resource: Designer
// without orders:read won't see Revenue / Orders / Recent Orders cards;
// without contacts:read won't see New Contacts; etc. Data fetches are
// conditional too — we never hit the DB for stats the viewer can't see.

export default async function DashboardPage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const { workspaceId, permissions, isOwner } = await requireWorkspaceFromSlug(workspaceSlug);

  const has = (p: string) => isOwner || permissions.includes(p);
  const canReadOrders        = has("orders:read");
  const canReadContacts      = has("contacts:read");
  const canReadSubscriptions = has("subscriptions:read");
  const canReadFunnels       = has("funnels:read");

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [revenueResult, orders30d, newContacts30d, activeSubscriptions, totalFunnels, recentOrders] =
    await Promise.all([
      canReadOrders
        ? db.order.aggregate({
            where: { workspaceId, status: "PAID", createdAt: { gte: thirtyDaysAgo } },
            _sum: { total: true },
          })
        : null,
      canReadOrders
        ? db.order.count({ where: { workspaceId, createdAt: { gte: thirtyDaysAgo } } })
        : null,
      canReadContacts
        ? db.contact.count({ where: { workspaceId, createdAt: { gte: thirtyDaysAgo } } })
        : null,
      canReadSubscriptions
        ? db.subscription.count({ where: { workspaceId, status: "ACTIVE" } })
        : null,
      canReadFunnels
        ? db.funnel.count({ where: { workspaceId, status: "ACTIVE" } })
        : null,
      canReadOrders
        ? db.order.findMany({
            where: { workspaceId },
            orderBy: { createdAt: "desc" },
            take: 5,
            include: {
              contact: { select: { email: true, firstName: true, lastName: true } },
              funnelStep: { select: { name: true, funnel: { select: { name: true } } } },
            },
          })
        : null,
    ]);

  const stats = {
    revenue30d:          revenueResult ? (revenueResult._sum.total ?? 0) : null,
    orders30d:           orders30d,
    newContacts30d:      newContacts30d,
    activeSubscriptions: activeSubscriptions,
    totalFunnels:        totalFunnels,
    recentOrders: recentOrders
      ? recentOrders.map((o) => ({
          id: o.id,
          status: o.status,
          total: o.total,
          currency: o.currency,
          createdAt: o.createdAt.toISOString(),
          contact: o.contact,
          funnelName: o.funnelStep?.funnel.name ?? null,
        }))
      : null,
  };

  return (
    <div className="flex flex-col h-full">
      <DashboardClient stats={stats} />
    </div>
  );
}
