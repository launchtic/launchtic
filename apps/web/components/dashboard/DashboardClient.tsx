"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  TrendingUp, ShoppingCart, Users, Repeat, Zap,
  CheckCircle, Clock, XCircle, RotateCcw, Ban, Timer, ArrowRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useRole } from "../../lib/role";

type RecentOrder = {
  id: string;
  status: string;
  total: number;
  currency: string;
  createdAt: string;
  contact: { email: string; firstName: string | null; lastName: string | null };
  funnelName: string | null;
};

// All stat fields are nullable — server returns null for any metric the
// viewer doesn't have read permission for. We filter the cards array on
// presence, so an empty workspace member (no reads at all) sees just the
// header — no leaky placeholders.
type Stats = {
  revenue30d:          number | null;
  orders30d:           number | null;
  newContacts30d:      number | null;
  activeSubscriptions: number | null;
  totalFunnels:        number | null;
  recentOrders:        RecentOrder[] | null;
};

const STATUS_STYLE: Record<string, { className: string; icon: React.ReactNode }> = {
  PAID:      { className: "bg-green-50 text-green-700 border-green-200",    icon: <CheckCircle size={11} /> },
  TRIAL:     { className: "bg-blue-50 text-blue-700 border-blue-200",       icon: <Timer size={11} /> },
  PENDING:   { className: "bg-amber-50 text-amber-700 border-amber-200",    icon: <Clock size={11} /> },
  FAILED:    { className: "bg-red-50 text-red-700 border-red-200",          icon: <XCircle size={11} /> },
  REFUNDED:  { className: "bg-purple-50 text-purple-700 border-purple-200", icon: <RotateCcw size={11} /> },
  CANCELED:  { className: "bg-gray-50 text-gray-600 border-gray-200",       icon: <Ban size={11} /> },
  CANCELLED: { className: "bg-gray-50 text-gray-600 border-gray-200",       icon: <Ban size={11} /> },
};

function formatAmount(cents: number, currency: string) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 2,
  });
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_STYLE[status] ?? { className: "bg-gray-50 text-gray-600 border-gray-200", icon: null };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.className}`}>
      {cfg.icon}
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

function contactName(c: RecentOrder["contact"]) {
  const full = [c.firstName, c.lastName].filter(Boolean).join(" ");
  return full || c.email;
}

type StatCard = {
  label: string;
  value: string;
  icon:  LucideIcon;
  color: string;
  bg:    string;
};

type QuickLink = {
  href:  string;
  label: string;
  icon:  LucideIcon;
  count: number;
};

export default function DashboardClient({ stats }: { stats: Stats }) {
  const params = useParams();
  const slug = params.workspaceSlug as string;
  const { canReadOrders, canReadContacts, canReadSubscriptions, canReadFunnels } = useRole();

  // Build cards conditionally — null stats means the user has no perm OR
  // the data legitimately came back as 0 with perm. We use null-checking
  // (not falsiness) so a real 0 still shows the card.
  const statCards: StatCard[] = [
    stats.revenue30d != null && canReadOrders && {
      label: "Revenue (30d)",
      value: formatAmount(stats.revenue30d, "usd"),
      icon: TrendingUp,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    stats.orders30d != null && canReadOrders && {
      label: "Orders (30d)",
      value: stats.orders30d.toLocaleString(),
      icon: ShoppingCart,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    stats.newContacts30d != null && canReadContacts && {
      label: "New Contacts (30d)",
      value: stats.newContacts30d.toLocaleString(),
      icon: Users,
      color: "text-violet-600",
      bg: "bg-violet-50",
    },
    stats.activeSubscriptions != null && canReadSubscriptions && {
      label: "Active Subscriptions",
      value: stats.activeSubscriptions.toLocaleString(),
      icon: Repeat,
      color: "text-orange-600",
      bg: "bg-orange-50",
    },
  ].filter(Boolean) as StatCard[];

  const quickLinks: QuickLink[] = [
    canReadFunnels       && { href: `/${slug}/funnels`,       label: "Funnels",       icon: Zap,          count: stats.totalFunnels        ?? 0 },
    canReadOrders        && { href: `/${slug}/orders`,        label: "Orders",        icon: ShoppingCart, count: stats.orders30d           ?? 0 },
    canReadContacts      && { href: `/${slug}/contacts`,      label: "Contacts",      icon: Users,        count: stats.newContacts30d      ?? 0 },
    canReadSubscriptions && { href: `/${slug}/subscriptions`, label: "Subscriptions", icon: Repeat,       count: stats.activeSubscriptions ?? 0 },
  ].filter(Boolean) as QuickLink[];

  const showRecentOrders = stats.recentOrders != null && canReadOrders;

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        </div>

        {/* Stat cards — hidden entirely if user has zero readable resources */}
        {statCards.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {statCards.map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
                  <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
                    <Icon size={16} className={color} />
                  </div>
                </div>
                <p className="text-2xl font-semibold text-gray-900">{value}</p>
                <p className="text-xs text-gray-400 mt-1">Last 30 days</p>
              </div>
            ))}
          </div>
        )}

        {/* Recent orders + Quick links — render lower row only if at least
            one of the two sub-cards has content. Otherwise the row would
            be empty whitespace for low-permission users. */}
        {(showRecentOrders || quickLinks.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Recent orders */}
            {showRecentOrders && (
              <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                  <h2 className="text-sm font-semibold text-gray-900">Recent Orders</h2>
                  <Link href={`/${slug}/orders`} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
                    View all <ArrowRight size={12} />
                  </Link>
                </div>

                {stats.recentOrders!.length === 0 ? (
                  <div className="px-5 py-10 text-center text-sm text-gray-400">No recent orders</div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {stats.recentOrders!.map((order) => (
                      <Link
                        key={order.id}
                        href={`/${slug}/orders/${order.id}`}
                        className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{contactName(order.contact)}</p>
                          <p className="text-xs text-gray-400 truncate">{order.funnelName ?? order.contact.email}</p>
                        </div>
                        <div className="flex items-center gap-3 ml-4 shrink-0">
                          <StatusBadge status={order.status} />
                          <span className="text-sm font-semibold text-gray-800">
                            {formatAmount(order.total, order.currency)}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Quick links */}
            {quickLinks.length > 0 && (
              <div className={`bg-white rounded-xl border border-gray-200 ${!showRecentOrders ? "lg:col-span-3" : ""}`}>
                <div className="px-5 py-4 border-b border-gray-100">
                  <h2 className="text-sm font-semibold text-gray-900">Quick Links</h2>
                </div>
                <div className="divide-y divide-gray-50">
                  {quickLinks.map(({ href, label, icon: Icon, count }) => (
                    <Link
                      key={href}
                      href={href}
                      className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Icon size={15} className="text-gray-500" />
                        <span className="text-sm text-gray-700">{label}</span>
                      </div>
                      <span className="text-xs text-gray-400 tabular-nums">{count.toLocaleString()}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
