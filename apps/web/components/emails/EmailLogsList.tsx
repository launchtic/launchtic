"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Search, Loader2, AlertCircle, CheckCircle, Clock, Send, X, ExternalLink, RefreshCw, Mail, Trash2,
} from "lucide-react";
import { useConfirm } from "../ui/ConfirmDialog";
import { useToast } from "../ui/Toast";

type Status = "QUEUED" | "SENT" | "FAILED" | "BOUNCED";
type SourceType = "BROADCAST" | "TEMPLATE" | "AUTOMATION" | "SEQUENCE" | "TRANSACTIONAL";

type Row = {
  id: string;
  toEmail: string;
  subject: string;
  status: Status;
  queuedAt: string;
  sentAt: string | null;
  failedAt: string | null;
  errorMessage: string | null;
  sourceType: SourceType;
  sourceName: string;
  sourceId: string | null;
};

type Detail = {
  id: string;
  toEmail: string;
  subject: string;
  status: Status;
  errorMessage: string | null;
  providerMessageId: string | null;
  queuedAt: string;
  sentAt: string | null;
  failedAt: string | null;
  contact: { id: string; email: string; firstName: string | null; lastName: string | null } | null;
  source: { type: SourceType; name: string; href: string | null };
  preview: { available: boolean; subject: string | null; html: string | null; warning: string | null };
};

const STATUS_BADGE: Record<Status, { label: string; cls: string; Icon: typeof Send }> = {
  QUEUED:  { label: "Queued",  cls: "bg-blue-50 text-blue-700",       Icon: Clock        },
  SENT:    { label: "Sent",    cls: "bg-emerald-50 text-emerald-700", Icon: CheckCircle  },
  FAILED:  { label: "Failed",  cls: "bg-red-50 text-red-700",         Icon: AlertCircle  },
  BOUNCED: { label: "Bounced", cls: "bg-amber-50 text-amber-700",     Icon: AlertCircle  },
};

const STATUS_TABS: { id: "ALL" | Status; label: string }[] = [
  { id: "ALL",     label: "All" },
  { id: "SENT",    label: "Sent" },
  { id: "FAILED",  label: "Failed" },
  { id: "BOUNCED", label: "Bounced" },
  { id: "QUEUED",  label: "Queued" },
];

const SOURCE_OPTIONS: { value: "ALL" | SourceType; label: string }[] = [
  { value: "ALL",           label: "All sources" },
  { value: "BROADCAST",     label: "Broadcasts" },
  { value: "SEQUENCE",      label: "Sequences" },
  { value: "AUTOMATION",    label: "Automations" },
  { value: "TEMPLATE",      label: "Templates" },
  { value: "TRANSACTIONAL", label: "Transactional" },
];

const RANGE_OPTIONS = [
  { value: "all", label: "All time" },
  { value: "24h", label: "Last 24h" },
  { value: "7d",  label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

export default function EmailLogsList() {
  const confirm = useConfirm();
  const toast = useToast();
  const [items, setItems] = useState<Row[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [tab, setTab] = useState<"ALL" | Status>("ALL");
  const [source, setSource] = useState<"ALL" | SourceType>("ALL");
  const [range, setRange] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const buildUrl = useCallback(
    (cursor: string | null) => {
      const params = new URLSearchParams();
      if (tab !== "ALL")    params.set("status", tab);
      if (source !== "ALL") params.set("source", source);
      if (range !== "all")  params.set("range", range);
      if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());
      if (cursor) params.set("cursor", cursor);
      return `/api/emails/logs?${params.toString()}`;
    },
    [tab, source, range, debouncedSearch],
  );

  // Initial / filter-change load
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(buildUrl(null))
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.success) {
          setItems(json.data.items);
          setNextCursor(json.data.nextCursor);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [buildUrl]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(buildUrl(nextCursor));
      const json = await res.json();
      if (json.success) {
        setItems((prev) => [...prev, ...json.data.items]);
        setNextCursor(json.data.nextCursor);
      }
    } finally {
      setLoadingMore(false);
    }
  }

  function handleAfterRetry(id: string) {
    setItems((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, status: "QUEUED", errorMessage: null, failedAt: null }
          : r,
      ),
    );
  }

  // Bulk-clear logs matching the current filter set. Mirrors the URL params
  // already in use so "Clear" deletes exactly what the user is looking at.
  async function handleClear() {
    const filterParts: string[] = [];
    if (tab !== "ALL")    filterParts.push(`status: ${tab.toLowerCase()}`);
    if (source !== "ALL") filterParts.push(`source: ${source.toLowerCase()}`);
    if (range !== "all")  filterParts.push(`last ${range}`);
    const scope = filterParts.length > 0 ? filterParts.join(", ") : "all logs";

    const ok = await confirm({
      title: "Clear email logs?",
      description:
        `This will permanently delete log rows matching: ${scope}. ` +
        `Broadcast/sequence stats are NOT recomputed — only audit history is removed.`,
      confirmLabel: "Clear logs",
      variant: "danger",
    });
    if (!ok) return;

    setClearing(true);
    try {
      const body: Record<string, unknown> = {};
      if (tab !== "ALL")    body.status = tab;
      if (source !== "ALL") body.source = source;
      if (range !== "all")  body.range  = range;

      const res = await fetch("/api/emails/logs/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) { toast.error(json.error ?? "Failed to clear logs"); return; }
      toast.success(`Cleared ${json.data.deleted} log${json.data.deleted === 1 ? "" : "s"}`);
      // Refetch to refresh the visible list (rows outside the filter remain)
      setItems([]);
      setNextCursor(null);
      const refetch = await fetch(buildUrl(null));
      const refetchJson = await refetch.json();
      if (refetchJson.success) {
        setItems(refetchJson.data.items);
        setNextCursor(refetchJson.data.nextCursor);
      }
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200 bg-white shrink-0 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Mail size={18} className="text-gray-700" />
              <h1 className="text-base font-semibold text-gray-900">Email Logs</h1>
            </div>
            <p className="text-sm text-gray-500">Every email queued or sent from this workspace.</p>
          </div>
          <button
            onClick={handleClear}
            disabled={clearing || (items.length === 0 && !loading)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-white border border-red-200 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors shrink-0"
            title="Delete log rows matching the current filter"
          >
            {clearing ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
            Clear logs
          </button>
        </div>

        {/* Filters */}
        <div className="px-4 sm:px-6 py-3 border-b border-gray-100 bg-white shrink-0 space-y-3">
          {/* Status tabs */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-0.5 w-fit">
            {STATUS_TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  tab === t.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Search + source + range */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search recipient or subject..."
                className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-300"
              />
            </div>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as "ALL" | SourceType)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {SOURCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select
              value={range}
              onChange={(e) => setRange(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {RANGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={20} className="animate-spin text-gray-400" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Mail size={32} className="text-gray-300 mb-2" />
              <p className="text-sm text-gray-500">No email logs match your filters.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {items.map((r) => {
                const badge = STATUS_BADGE[r.status];
                const Icon = badge.Icon;
                const time = r.sentAt ?? r.failedAt ?? r.queuedAt;
                return (
                  <li key={r.id}>
                    <button
                      onClick={() => setSelectedId(r.id)}
                      className={`w-full flex items-center gap-3 px-4 sm:px-6 py-3 text-left hover:bg-gray-50 transition-colors ${
                        selectedId === r.id ? "bg-blue-50" : ""
                      }`}
                    >
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${badge.cls} shrink-0`}>
                        <Icon size={11} />
                        {badge.label}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-900 truncate">{r.toEmail}</p>
                          <span className="text-xs text-gray-400 shrink-0">·</span>
                          <p className="text-xs text-gray-500 truncate">{r.sourceName}</p>
                        </div>
                        <p className="text-xs text-gray-500 truncate">{r.subject}</p>
                      </div>
                      <span className="text-xs text-gray-400 shrink-0 hidden sm:block">
                        {new Date(time).toLocaleString()}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {nextCursor && !loading && (
            <div className="flex justify-center py-4">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50 rounded-xl transition-colors"
              >
                {loadingMore && <Loader2 size={14} className="animate-spin" />}
                Load more
              </button>
            </div>
          )}
        </div>
      </div>

      {selectedId && (
        <DetailDrawer
          id={selectedId}
          onClose={() => setSelectedId(null)}
          onRetried={() => handleAfterRetry(selectedId)}
        />
      )}
    </div>
  );
}

// ─── Detail drawer ───────────────────────────────────────────────────────────

function DetailDrawer({ id, onClose, onRetried }: { id: string; onClose: () => void; onRetried: () => void }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/emails/logs/${id}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.success) setData(json.data);
        else setError(json.error ?? "Failed to load");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  async function handleRetry() {
    if (!data) return;
    const ok = await confirm({
      title: "Retry this email?",
      description: `It will be re-queued and sent to ${data.toEmail}.`,
      confirmLabel: "Retry",
      variant: "default",
    });
    if (!ok) return;

    setRetrying(true);
    const res = await fetch(`/api/emails/logs/${id}/retry`, { method: "POST" });
    const json = await res.json();
    setRetrying(false);
    if (!json.success) { toast.error(json.error ?? "Retry failed"); return; }
    setData((prev) => prev ? { ...prev, status: "QUEUED", errorMessage: null, failedAt: null } : prev);
    onRetried();
  }

  const badge = data ? STATUS_BADGE[data.status] : null;
  const canRetry = data?.status === "FAILED" || data?.status === "BOUNCED";

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <aside className="fixed right-0 top-0 z-50 h-full w-full sm:w-[600px] bg-white shadow-2xl border-l border-gray-200 flex flex-col">
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-sm font-semibold text-gray-900">Email details</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={20} className="animate-spin text-gray-400" />
            </div>
          ) : error ? (
            <div className="px-5 py-8 text-center">
              <AlertCircle size={20} className="mx-auto text-red-500 mb-2" />
              <p className="text-sm text-gray-700">{error}</p>
            </div>
          ) : data ? (
            <div className="p-5 space-y-5">
              {/* Status + actions */}
              <div className="flex items-center justify-between gap-3">
                {badge && (
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full ${badge.cls}`}>
                    <badge.Icon size={12} />
                    {badge.label}
                  </span>
                )}
                {canRetry && (
                  <button
                    onClick={handleRetry}
                    disabled={retrying}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors"
                  >
                    {retrying ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    Retry
                  </button>
                )}
              </div>

              {/* Recipient + subject */}
              <KV label="Recipient" value={data.toEmail} />
              <KV label="Subject"   value={data.subject} />

              {/* Source */}
              <div>
                <p className="text-xs text-gray-400 mb-1">Source</p>
                {data.source.href ? (
                  <Link
                    href={data.source.href}
                    className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                  >
                    {data.source.name}
                    <ExternalLink size={11} />
                  </Link>
                ) : (
                  <p className="text-sm text-gray-700">{data.source.name}</p>
                )}
                <p className="text-xs text-gray-400 mt-0.5">{data.source.type}</p>
              </div>

              {/* Timestamps */}
              <div className="grid grid-cols-3 gap-3">
                <Time label="Queued" iso={data.queuedAt} />
                <Time label="Sent"   iso={data.sentAt} />
                <Time label="Failed" iso={data.failedAt} />
              </div>

              {/* Error */}
              {data.errorMessage && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">Error</p>
                  <pre className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 whitespace-pre-wrap break-all">
                    {data.errorMessage}
                  </pre>
                </div>
              )}

              {/* Provider message ID */}
              {data.providerMessageId && (
                <KV label="Message ID" value={data.providerMessageId} mono />
              )}

              {/* Preview */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-gray-400">HTML preview</p>
                  {data.preview.available && data.preview.subject && (
                    <p className="text-xs text-gray-500 truncate ml-2">{data.preview.subject}</p>
                  )}
                </div>
                {data.preview.warning && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
                    {data.preview.warning}
                  </p>
                )}
                {data.preview.available && data.preview.html ? (
                  <iframe
                    ref={iframeRef}
                    title="Email preview"
                    srcDoc={data.preview.html}
                    sandbox=""
                    className="w-full p-2 min-h-[400px] border border-gray-100 rounded-lg bg-white"
                  />
                ) : (
                  <div className="text-xs text-gray-400 border border-dashed border-gray-200 rounded-lg px-3 py-6 text-center">
                    No preview available
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
}

function KV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-sm text-gray-900 break-all ${mono ? "font-mono text-xs" : ""}`}>{value}</p>
    </div>
  );
}

function Time({ label, iso }: { label: string; iso: string | null }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-xs text-gray-700 mt-0.5">
        {iso ? new Date(iso).toLocaleString() : "—"}
      </p>
    </div>
  );
}
