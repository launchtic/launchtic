"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Search, ChevronDown, Loader2, Repeat,
  CheckCircle, Timer, Ban, AlertCircle, Clock,
} from "lucide-react";

type Contact = { id: string; email: string; firstName: string | null; lastName: string | null };
type FunnelStep = { name: string; funnel: { name: string } };
type Subscription = {
  id: string;
  status: string;
  paymentProvider: string;
  providerSubId: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialEnd: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  planSnapshot: {
    planName?: string | null;
    amount?: number | null;
    finalAmount?: number | null;
    currency?: string | null;
    interval?: string | null;
    trialDays?: number | null;
  } | null;
  contact: Contact;
  funnelStep: FunnelStep | null;
  _count: { orders: number };
};
const STATUS_STYLE: Record<string, { className: string; icon: React.ReactNode }> = {
  ACTIVE:     { className: "bg-green-50 text-green-700 border-green-200",  icon: <CheckCircle size={11} /> },
  TRIALING:   { className: "bg-blue-50 text-blue-700 border-blue-200",     icon: <Timer size={11} /> },
  PAST_DUE:   { className: "bg-red-50 text-red-700 border-red-200",        icon: <AlertCircle size={11} /> },
  CANCELED:   { className: "bg-gray-50 text-gray-600 border-gray-200",     icon: <Ban size={11} /> },
  INCOMPLETE: { className: "bg-amber-50 text-amber-700 border-amber-200",  icon: <Clock size={11} /> },
};

function formatAmount(amount: number | null | undefined, currency: string | null | undefined) {
  if (amount == null) return "—";
  return (amount / 100).toLocaleString("en-US", {
    style: "currency",
    currency: (currency ?? "usd").toUpperCase(),
  });
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

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active", TRIALING: "Trialing", PAST_DUE: "Past Due",
  INCOMPLETE: "Incomplete", CANCELED: "Canceled",
};

export default function SubscriptionsClient({ initialTotal = 0 }: { initialTotal?: number }) {
  const params = useParams();
  const slug = params.workspaceSlug as string;
  const [items, setItems] = useState<Subscription[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const STATUS_FILTERS = [
    { value: null,         label: "All statuses" },
    { value: "ACTIVE",     label: "Active" },
    { value: "TRIALING",   label: "Trialing" },
    { value: "PAST_DUE",   label: "Past Due" },
    { value: "INCOMPLETE", label: "Incomplete" },
    { value: "CANCELED",   label: "Canceled" },
  ];

  const fetchPage = useCallback(async (q: string, status: string | null, cursor: string | null) => {
    const params = new URLSearchParams();
    if (q)      params.set("search", q);
    if (status) params.set("status", status);
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`/api/subscriptions?${params}`);
    return res.json();
  }, []);

  const refresh = useCallback(async (q: string, status: string | null) => {
    setLoading(true);
    const json = await fetchPage(q, status, null);
    if (json.success) {
      setItems(json.data.items);
      setNextCursor(json.data.nextCursor);
    }
    setLoading(false);
  }, [fetchPage]);

  useEffect(() => {
    refresh(search, statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const json = await fetchPage(search, statusFilter, nextCursor);
    if (json.success) {
      setItems((prev) => [...prev, ...json.data.items]);
      setNextCursor(json.data.nextCursor);
    }
    setLoadingMore(false);
  }

  function handleSearch(val: string) {
    setSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => refresh(val, statusFilter), 350);
  }

  function handleStatusFilter(val: string | null) {
    setStatusFilter(val);
  }

  const fullName = (c: Contact) =>
    [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email;

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 px-4 sm:px-6 py-4 shrink-0">
        <div className="shrink-0">
          <h1 className="text-xl font-bold text-gray-900">Subscriptions</h1>
          <p className="text-sm text-gray-500 mt-0.5">{initialTotal} {initialTotal === 1 ? "subscription" : "subscriptions"}</p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 lg:max-w-2xl lg:flex-1 lg:justify-end">
          <div className="relative sm:flex-1 lg:max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search subscriptions…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>

          <div className="relative shrink-0">
            <select
              value={statusFilter ?? ""}
              onChange={(e) => handleStatusFilter(e.target.value || null)}
              className={`w-full sm:w-auto appearance-none pl-3 pr-8 py-2 text-sm border rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer ${
                statusFilter
                  ? "border-blue-200 bg-blue-50 text-blue-700 font-medium"
                  : "border-gray-200 text-gray-700"
              }`}
            >
              {STATUS_FILTERS.map(({ value, label }) => (
                <option key={value ?? "__all__"} value={value ?? ""}>
                  {label}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 sm:px-6 pb-4">
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={20} className="animate-spin text-gray-400" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mb-3">
              <Repeat size={20} className="text-blue-500" />
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">No subscriptions yet</p>
            <p className="text-xs text-gray-400">
              {search || statusFilter ? "No subscriptions match your filters" : "Recurring subscriptions will appear here"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="text-left px-6 py-3 font-semibold">Subscription</th>
                  <th className="text-left px-4 py-3 font-semibold">Contact</th>
                  <th className="text-left px-4 py-3 font-semibold">Plan</th>
                  <th className="text-left px-4 py-3 font-semibold">Status</th>
                  <th className="text-right px-4 py-3 font-semibold">Amount</th>
                  <th className="text-left px-4 py-3 font-semibold">Next Renewal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((s) => {
                  const shortId = s.id.slice(-8).toUpperCase();
                  const amount = s.planSnapshot?.finalAmount ?? s.planSnapshot?.amount ?? null;
                  const currency = s.planSnapshot?.currency ?? null;
                  const interval = s.planSnapshot?.interval ?? null;
                  const nextRenewal = s.currentPeriodEnd ? new Date(s.currentPeriodEnd) : null;
                  const trialActive = s.trialEnd && new Date(s.trialEnd).getTime() > Date.now();

                  return (
                    <tr key={s.id} className="hover:bg-gray-50 transition-colors group">
                      <td className="px-6 py-3">
                        <Link href={`/${slug}/subscriptions/${s.id}`} className="block">
                          <div className="flex items-center gap-1.5">
                            <p className="font-medium text-gray-900 group-hover:text-blue-700 transition-colors font-mono text-xs">
                              #{shortId}
                            </p>
                            {s.cancelAtPeriodEnd && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-50 text-orange-700 border border-orange-100">
                                {nextRenewal ? `Ends ${nextRenewal.toLocaleDateString()}` : "—"}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5 capitalize">{s.paymentProvider}</p>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/${slug}/contacts/${s.contact.id}`} className="text-sm text-gray-700 hover:text-blue-600 transition-colors">
                          {fullName(s.contact)}
                        </Link>
                        <p className="text-xs text-gray-400">{s.contact.email}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        <p className="text-sm text-gray-700">{s.planSnapshot?.planName ?? "—"}</p>
                        {s.funnelStep && (
                          <p className="text-xs text-gray-400">{s.funnelStep.funnel.name}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={s.status} label={STATUS_LABELS[s.status] ?? s.status} />
                        {trialActive && s.trialEnd && (
                          <p className="text-[10px] text-blue-600 mt-0.5">
                            Until {new Date(s.trialEnd).toLocaleDateString()}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {formatAmount(amount, currency)}
                        {interval && <span className="text-xs text-gray-400 font-normal">/{interval}</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {nextRenewal ? nextRenewal.toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

        {(nextCursor || items.length > 0) && !loading && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              Showing {items.length.toLocaleString()}{nextCursor ? "+" : ""}
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
  );
}
