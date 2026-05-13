"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Search, ChevronDown, Loader2, ShoppingCart,
  CheckCircle, Clock, XCircle, RotateCcw, Ban, Repeat, Timer,
} from "lucide-react";
type Contact = { id: string; email: string; firstName: string | null; lastName: string | null };
type FunnelStep = { name: string; funnel: { name: string } };
type OrderSubscription = { id: string; status: string; trialEnd: string | null };
type Order = {
  id: string;
  status: string;
  paymentProvider: string;
  providerOrderId: string | null;
  subscriptionId: string | null;
  isRenewal: boolean;
  total: number;
  currency: string;
  createdAt: string;
  contact: Contact;
  funnelStep: FunnelStep | null;
  subscription: OrderSubscription | null;
  _count: { transactions: number };
};
const STATUS_STYLE: Record<string, { className: string; icon: React.ReactNode }> = {
  PAID:     { className: "bg-green-50 text-green-700 border-green-200",    icon: <CheckCircle size={11} /> },
  TRIAL:    { className: "bg-blue-50 text-blue-700 border-blue-200",       icon: <Timer size={11} /> },
  PENDING:  { className: "bg-amber-50 text-amber-700 border-amber-200",    icon: <Clock size={11} /> },
  FAILED:   { className: "bg-red-50 text-red-700 border-red-200",          icon: <XCircle size={11} /> },
  REFUNDED: { className: "bg-purple-50 text-purple-700 border-purple-200", icon: <RotateCcw size={11} /> },
  CANCELED: { className: "bg-gray-50 text-gray-600 border-gray-200",       icon: <Ban size={11} /> },
};

function formatAmount(total: number, currency: string) {
  return (total / 100).toLocaleString("en-US", { style: "currency", currency: currency.toUpperCase() });
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const cfg = STATUS_STYLE[status] ?? { className: "bg-gray-50 text-gray-600 border-gray-200", icon: null };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.className}`}>
      {cfg.icon}
      {label}
    </span>
  );
}

export default function OrdersClient({ initialTotal = 0 }: { initialTotal?: number }) {
  const params = useParams();
  const slug = params.workspaceSlug as string;
  const [orders, setOrders] = useState<Order[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const STATUS_LABELS: Record<string, string> = {
    PAID: "Paid", TRIAL: "Trial", PENDING: "Pending",
    FAILED: "Failed", REFUNDED: "Refunded", CANCELED: "Canceled",
  };

  const STATUS_FILTERS = [
    { value: null,       label: "All statuses" },
    { value: "PAID",     label: "Paid" },
    { value: "TRIAL",    label: "Trial" },
    { value: "PENDING",  label: "Pending" },
    { value: "FAILED",   label: "Failed" },
    { value: "REFUNDED", label: "Refunded" },
    { value: "CANCELED", label: "Canceled" },
  ];

  const KIND_FILTERS = [
    { value: null,           label: "All kinds" },
    { value: "one_time",     label: "One-time" },
    { value: "subscription", label: "Subscription" },
    { value: "renewal",      label: "Renewal" },
  ];

  const fetchPage = useCallback(async (q: string, status: string | null, kind: string | null, cursor: string | null) => {
    const params = new URLSearchParams();
    if (q)      params.set("search", q);
    if (status) params.set("status", status);
    if (kind)   params.set("kind", kind);
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`/api/orders?${params}`);
    return res.json();
  }, []);

  const refresh = useCallback(async (q: string, status: string | null, kind: string | null) => {
    setLoading(true);
    const json = await fetchPage(q, status, kind, null);
    if (json.success) {
      setOrders(json.data.items);
      setNextCursor(json.data.nextCursor);
    }
    setLoading(false);
  }, [fetchPage]);

  useEffect(() => {
    refresh(search, statusFilter, kindFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, kindFilter]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const json = await fetchPage(search, statusFilter, kindFilter, nextCursor);
    if (json.success) {
      setOrders((prev) => [...prev, ...json.data.items]);
      setNextCursor(json.data.nextCursor);
    }
    setLoadingMore(false);
  }

  function handleSearch(val: string) {
    setSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => refresh(val, statusFilter, kindFilter), 350);
  }

  function handleStatusFilter(val: string | null) { setStatusFilter(val); }
  function handleKindFilter(val: string | null) { setKindFilter(val); }

  const fullName = (c: Contact) =>
    [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email;

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 px-4 sm:px-6 py-4 shrink-0">
        <div className="shrink-0">
          <h1 className="text-xl font-bold text-gray-900">Orders</h1>
          <p className="text-sm text-gray-500 mt-0.5">{initialTotal} {initialTotal === 1 ? "order" : "orders"}</p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 lg:max-w-3xl lg:flex-1 lg:justify-end">
          <div className="relative sm:flex-1 lg:max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search orders…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="relative">
              <select
                value={statusFilter ?? ""}
                onChange={(e) => handleStatusFilter(e.target.value || null)}
                className={`appearance-none pl-3 pr-8 py-2 text-sm border rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer ${
                  statusFilter ? "border-blue-200 bg-blue-50 text-blue-700 font-medium" : "border-gray-200 text-gray-700"
                }`}
              >
                {STATUS_FILTERS.map(({ value, label }) => (
                  <option key={label} value={value ?? ""}>{label}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>

            <div className="relative">
              <select
                value={kindFilter ?? ""}
                onChange={(e) => handleKindFilter(e.target.value || null)}
                className={`appearance-none pl-3 pr-8 py-2 text-sm border rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer ${
                  kindFilter ? "border-purple-200 bg-purple-50 text-purple-700 font-medium" : "border-gray-200 text-gray-700"
                }`}
              >
                {KIND_FILTERS.map(({ value, label }) => (
                  <option key={label} value={value ?? ""}>{label}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-4 sm:px-6 pb-4">
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={20} className="animate-spin text-gray-400" />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mb-3">
              <ShoppingCart size={20} className="text-blue-500" />
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">No orders yet</p>
            <p className="text-xs text-gray-400">
              {search || statusFilter ? "No orders match your filters" : "Orders will appear here when customers purchase"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <th className="text-left px-6 py-3 font-semibold">Order</th>
                <th className="text-left px-4 py-3 font-semibold">Contact</th>
                <th className="text-left px-4 py-3 font-semibold">Funnel</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
                <th className="text-right px-4 py-3 font-semibold">Amount</th>
                <th className="text-left px-4 py-3 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-gray-50 transition-colors group">
                  <td className="px-6 py-3">
                    <Link href={`/${slug}/orders/${o.id}`} className="block">
                      <div className="flex items-center gap-1.5">
                        <p className="font-medium text-gray-900 group-hover:text-blue-700 transition-colors font-mono text-xs">
                          #{o.id.slice(-8).toUpperCase()}
                        </p>
                        {o.subscriptionId && (
                          o.isRenewal ? (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                              <Repeat size={9} /> Renewal
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-100">
                              <Repeat size={9} /> Subscription
                            </span>
                          )
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 capitalize">{o.paymentProvider}</p>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/${slug}/contacts/${o.contact.id}`} className="text-sm text-gray-700 hover:text-blue-600 transition-colors">
                      {fullName(o.contact)}
                    </Link>
                    <p className="text-xs text-gray-400">{o.contact.email}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {o.funnelStep ? (
                      <div>
                        <p className="text-sm text-gray-700">{o.funnelStep.funnel.name}</p>
                        <p className="text-xs text-gray-400">{o.funnelStep.name}</p>
                      </div>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      status={o.status}
                        label={STATUS_LABELS[o.status] ?? o.status}
                    />
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    {formatAmount(o.total, o.currency)}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(o.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}

        {(nextCursor || orders.length > 0) && !loading && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              Showing {orders.length.toLocaleString()}{nextCursor ? "+" : ""}
            </p>
            {nextCursor && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:opacity-50 rounded-lg transition-colors"
              >
                {loadingMore && <Loader2 size={12} className="animate-spin" />}
                Load more
              </button>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
