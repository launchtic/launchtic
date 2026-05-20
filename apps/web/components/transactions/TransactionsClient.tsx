"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Search, ChevronDown, Loader2, Receipt,
  ArrowDownCircle, RotateCcw, AlertTriangle,
  CheckCircle, Clock, XCircle,
} from "lucide-react";
import { apiFetch } from "../../lib/api-client";

type Contact = { id: string; email: string; firstName: string | null; lastName: string | null };
type OrderRef = {
  id: string;
  total: number;
  currency: string;
  paymentProvider: string;
  contact: Contact;
};
type Transaction = {
  id: string;
  orderId: string;
  type: string;
  amount: number;
  currency: string;
  reference: string | null;
  status: string;
  createdAt: string;
  order: OrderRef;
};
const TYPE_CONFIG: Record<string, { iconBg: string; icon: React.ReactNode; badgeClass: string }> = {
  SALE:       { iconBg: "bg-green-100",  icon: <ArrowDownCircle size={14} className="text-green-600" />,  badgeClass: "bg-green-50 text-green-700 border-green-200" },
  REFUND:     { iconBg: "bg-orange-100", icon: <RotateCcw size={14} className="text-orange-600" />,       badgeClass: "bg-orange-50 text-orange-700 border-orange-200" },
  CHARGEBACK: { iconBg: "bg-red-100",    icon: <AlertTriangle size={14} className="text-red-600" />,      badgeClass: "bg-red-50 text-red-700 border-red-200" },
};

const STATUS_CONFIG: Record<string, { className: string; icon: React.ReactNode }> = {
  COMPLETED: { className: "bg-green-50 text-green-700 border-green-200",  icon: <CheckCircle size={11} /> },
  PENDING:   { className: "bg-amber-50 text-amber-700 border-amber-200",  icon: <Clock size={11} /> },
  FAILED:    { className: "bg-red-50 text-red-700 border-red-200",        icon: <XCircle size={11} /> },
};

function formatAmount(amount: number, currency: string) {
  return (amount / 100).toLocaleString("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  });
}

const TYPE_LABELS: Record<string, string> = { SALE: "Sale", REFUND: "Refund", CHARGEBACK: "Chargeback" };
const STATUS_LABELS: Record<string, string> = { COMPLETED: "Completed", PENDING: "Pending", FAILED: "Failed" };

export default function TransactionsClient({ initialTotal = 0 }: { initialTotal?: number }) {
  const params = useParams();
  const slug = params.workspaceSlug as string;
  const [items, setItems] = useState<Transaction[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const TYPE_FILTERS = [
    { value: null,         label: "All types" },
    { value: "SALE",       label: "Sales" },
    { value: "REFUND",     label: "Refunds" },
    { value: "CHARGEBACK", label: "Chargebacks" },
  ];

  const STATUS_FILTERS = [
    { value: null,        label: "All statuses" },
    { value: "COMPLETED", label: "Completed" },
    { value: "PENDING",   label: "Pending" },
    { value: "FAILED",    label: "Failed" },
  ];

  const fetchPage = useCallback(async (q: string, type: string | null, status: string | null, cursor: string | null) => {
    const params = new URLSearchParams();
    if (q)      params.set("search", q);
    if (type)   params.set("type", type);
    if (status) params.set("status", status);
    if (cursor) params.set("cursor", cursor);
    const res = await apiFetch(`/api/transactions?${params}`);
    return res.json();
  }, []);

  const refresh = useCallback(async (q: string, type: string | null, status: string | null) => {
    setLoading(true);
    const json = await fetchPage(q, type, status, null);
    if (json.success) {
      setItems(json.data.items);
      setNextCursor(json.data.nextCursor);
    }
    setLoading(false);
  }, [fetchPage]);

  useEffect(() => {
    refresh(search, typeFilter, statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, statusFilter]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const json = await fetchPage(search, typeFilter, statusFilter, nextCursor);
    if (json.success) {
      setItems((prev) => [...prev, ...json.data.items]);
      setNextCursor(json.data.nextCursor);
    }
    setLoadingMore(false);
  }

  function handleSearch(val: string) {
    setSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => refresh(val, typeFilter, statusFilter), 350);
  }

  const fullName = (c: Contact) =>
    [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email;

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 px-4 sm:px-6 py-4 shrink-0">
        <div className="shrink-0">
          <h1 className="text-xl font-bold text-gray-900">Transactions</h1>
          <p className="text-sm text-gray-500 mt-0.5">{initialTotal} {initialTotal === 1 ? "transaction" : "transactions"}</p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 lg:max-w-3xl lg:flex-1 lg:justify-end">
          <div className="relative sm:flex-1 lg:max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search transactions…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="relative">
              <select
                value={typeFilter ?? ""}
                onChange={(e) => setTypeFilter(e.target.value || null)}
                className={`appearance-none pl-3 pr-8 py-2 text-sm border rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer ${
                  typeFilter
                    ? "border-blue-200 bg-blue-50 text-blue-700 font-medium"
                    : "border-gray-200 text-gray-700"
                }`}
              >
                {TYPE_FILTERS.map(({ value, label }) => (
                  <option key={value ?? "__all__"} value={value ?? ""}>{label}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>

            <div className="relative">
              <select
                value={statusFilter ?? ""}
                onChange={(e) => setStatusFilter(e.target.value || null)}
                className={`appearance-none pl-3 pr-8 py-2 text-sm border rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer ${
                  statusFilter
                    ? "border-purple-200 bg-purple-50 text-purple-700 font-medium"
                    : "border-gray-200 text-gray-700"
                }`}
              >
                {STATUS_FILTERS.map(({ value, label }) => (
                  <option key={value ?? "__all__"} value={value ?? ""}>{label}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
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
              <Receipt size={20} className="text-blue-500" />
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">No transactions yet</p>
            <p className="text-xs text-gray-400">
              {search || typeFilter || statusFilter ? "No transactions match your filters" : "Transactions will appear here when orders are placed"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <th className="text-left px-6 py-3 font-semibold">Transaction</th>
                <th className="text-left px-4 py-3 font-semibold">Contact</th>
                <th className="text-left px-4 py-3 font-semibold">Type</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
                <th className="text-right px-4 py-3 font-semibold">Amount</th>
                <th className="text-left px-4 py-3 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((tx) => {
                const typeCfg = TYPE_CONFIG[tx.type] ?? { iconBg: "bg-gray-100", icon: null, badgeClass: "bg-gray-50 text-gray-600 border-gray-200" };
                const statusCfg = STATUS_CONFIG[tx.status] ?? { className: "bg-gray-50 text-gray-600 border-gray-200", icon: null };
                return (
                  <tr key={tx.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-full ${typeCfg.iconBg} flex items-center justify-center shrink-0`}>
                          {typeCfg.icon}
                        </div>
                        <div className="min-w-0">
                          <Link href={`/${slug}/orders/${tx.order.id}`} className="text-sm font-medium text-gray-900 hover:text-blue-600 transition-colors font-mono">
                            #{tx.order.id.slice(-8).toUpperCase()}
                          </Link>
                          {tx.reference && (
                            <p className="text-[10px] font-mono text-gray-400 truncate max-w-[180px]">{tx.reference}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/${slug}/contacts/${tx.order.contact.id}`} className="text-sm text-gray-700 hover:text-blue-600 transition-colors">
                        {fullName(tx.order.contact)}
                      </Link>
                      <p className="text-xs text-gray-400">{tx.order.contact.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${typeCfg.badgeClass ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
                        {typeCfg.icon}
                        {TYPE_LABELS[tx.type] ?? tx.type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${statusCfg.className}`}>
                        {statusCfg.icon}
                        {STATUS_LABELS[tx.status] ?? tx.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {formatAmount(tx.amount, tx.currency)}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {new Date(tx.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}

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
    </div>
  );
}
