"use client";

import Link from "next/link";
import {
  TrendingUp, ShoppingCart, Users, Repeat, Zap,
  CheckCircle, Clock, XCircle, RotateCcw, Ban, Timer, ArrowRight,
} from "lucide-react";
import { useTranslations } from "next-intl";

type RecentOrder = {
  id: string;
  status: string;
  total: number;
  currency: string;
  createdAt: string;
  contact: { email: string; firstName: string | null; lastName: string | null };
  funnelName: string | null;
};

type Stats = {
  revenue30d: number;
  orders30d: number;
  newContacts30d: number;
  activeSubscriptions: number;
  totalFunnels: number;
  recentOrders: RecentOrder[];
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

export default function DashboardClient({ stats, workspaceName }: { stats: Stats; workspaceName: string }) {
  const t = useTranslations("dashboard");

  const statCards = [
    {
      label: t("revenue30d"),
      value: formatAmount(stats.revenue30d, "usd"),
      icon: TrendingUp,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      label: t("orders30d"),
      value: stats.orders30d.toLocaleString(),
      icon: ShoppingCart,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: t("newContacts30d"),
      value: stats.newContacts30d.toLocaleString(),
      icon: Users,
      color: "text-violet-600",
      bg: "bg-violet-50",
    },
    {
      label: t("activeSubscriptions"),
      value: stats.activeSubscriptions.toLocaleString(),
      icon: Repeat,
      color: "text-orange-600",
      bg: "bg-orange-50",
    },
  ];

  const quickLinks = [
    { href: "/funnels", label: t("quickLinks.funnels"), icon: Zap, count: stats.totalFunnels },
    { href: "/orders", label: t("quickLinks.orders"), icon: ShoppingCart, count: stats.orders30d },
    { href: "/contacts", label: t("quickLinks.contacts"), icon: Users, count: stats.newContacts30d },
    { href: "/subscriptions", label: t("quickLinks.subscriptions"), icon: Repeat, count: stats.activeSubscriptions },
  ];

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{t("title")}</h1>
          {workspaceName && (
            <p className="text-sm text-gray-500 mt-1">{workspaceName}</p>
          )}
        </div>

        {/* Stat cards */}
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
              <p className="text-xs text-gray-400 mt-1">{t("last30days")}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent orders */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">{t("recentOrders")}</h2>
              <Link href="/orders" className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
                {t("viewAll")} <ArrowRight size={12} />
              </Link>
            </div>

            {stats.recentOrders.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-gray-400">{t("noOrders")}</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {stats.recentOrders.map((order) => (
                  <Link
                    key={order.id}
                    href={`/orders/${order.id}`}
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

          {/* Quick links */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">{t("quickLinks.title")}</h2>
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
                  <div className="flex items-center gap-1.5 text-gray-400">
                    <span className="text-xs font-medium">{count}</span>
                    <ArrowRight size={13} />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
