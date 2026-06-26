"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Activity, StickyNote, Mail, Receipt, Tag as TagIcon, Workflow as WorkflowIcon,
  Eye, FileText, MousePointer, ShoppingCart, AlertCircle, CheckCircle, Loader2,
  CreditCard, Clock,
} from "lucide-react";
import { apiFetch } from "../../lib/api-client";
import ContactNotes from "./ContactNotes";

type Event = { id: string; type: string; data: Record<string, string> | null; createdAt: string };
type Tx = { id: string; type: string; amount: number; currency: string; status: string; createdAt: string };
type Order = { id: string; total: number; currency: string; status: string; createdAt: string; transactions: Tx[] };
type Run = {
  id: string; status: string; exitReason: string | null;
  startedAt: string; completedAt: string | null; workflowName: string;
};
type EmailSend = {
  id: string; subject: string | null; status: string;
  queuedAt: string; sentAt: string | null;
  errorMessage: string | null; sourceLabel: string | null;
};
type TabKey = "activity" | "notes" | "emails" | "transactions" | "tags" | "workflows";

// ─── Cursor-paginated fetch hook ─────────────────────────────────────────────
// Loads the first page on mount (so a tab only fetches when first opened) and
// appends further pages via loadMore().
function useCursorList<T>(baseUrl: string) {
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = useCallback(async (cur: string | null) => {
    const sep = baseUrl.includes("?") ? "&" : "?";
    const url = cur ? `${baseUrl}${sep}cursor=${encodeURIComponent(cur)}` : baseUrl;
    const res = await apiFetch(url);
    const json = await res.json();
    if (json.success) {
      setItems((prev) => (cur ? [...prev, ...json.data.items] : json.data.items));
      setCursor(json.data.nextCursor ?? null);
    }
  }, [baseUrl]);

  useEffect(() => {
    setLoading(true);
    fetchPage(null).finally(() => setLoading(false));
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (!cursor) return;
    setLoadingMore(true);
    await fetchPage(cursor);
    setLoadingMore(false);
  }, [cursor, fetchPage]);

  return { items, loading, loadingMore, hasMore: !!cursor, loadMore };
}

function LoadMore({ hasMore, loading, onClick }: { hasMore: boolean; loading: boolean; onClick: () => void }) {
  if (!hasMore) return null;
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full mt-2 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-500 hover:text-blue-600 bg-white border border-gray-200 hover:border-blue-200 rounded-xl transition-colors disabled:opacity-50"
    >
      {loading ? <Loader2 size={13} className="animate-spin" /> : null}
      Load more
    </button>
  );
}

const EVENT_ICON: Record<string, React.ReactNode> = {
  PAGE_VIEW:    <Eye size={13} className="text-blue-500" />,
  FORM_SUBMIT:  <FileText size={13} className="text-violet-500" />,
  PURCHASE:     <ShoppingCart size={13} className="text-green-600" />,
  TAG_ADDED:    <TagIcon size={13} className="text-emerald-500" />,
  TAG_REMOVED:  <TagIcon size={13} className="text-gray-400" />,
  EMAIL_SENT:   <Mail size={13} className="text-sky-500" />,
  EMAIL_OPENED: <Mail size={13} className="text-sky-500" />,
  EMAIL_CLICKED:<MousePointer size={13} className="text-indigo-500" />,
  EMAIL_BOUNCED:<AlertCircle size={13} className="text-red-500" />,
  EMAIL_UNSUBSCRIBED: <AlertCircle size={13} className="text-red-500" />,
};
const EVENT_LABEL: Record<string, string> = {
  PAGE_VIEW: "Viewed page", FORM_SUBMIT: "Submitted form", PURCHASE: "Made a purchase",
  TAG_ADDED: "Tag added", TAG_REMOVED: "Tag removed",
  EMAIL_SENT: "Email sent", EMAIL_OPENED: "Opened email", EMAIL_CLICKED: "Clicked email",
  EMAIL_BOUNCED: "Email bounced", EMAIL_UNSUBSCRIBED: "Unsubscribed",
  SEQUENCE_ENROLLED: "Enrolled in sequence", SEQUENCE_COMPLETED: "Completed sequence",
  SEQUENCE_EXITED: "Exited sequence",
};

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide" style={{ backgroundColor: `${color}1f`, color }}>
      {label}
    </span>
  );
}

const ORDER_COLOR: Record<string, string> = {
  PAID: "#16a34a", TRIAL: "#0ea5e9", PENDING: "#f59e0b",
  FAILED: "#ef4444", REFUNDED: "#8b5cf6", CANCELED: "#64748b",
};
const EMAIL_COLOR: Record<string, string> = {
  SENT: "#16a34a", QUEUED: "#f59e0b", FAILED: "#ef4444", BOUNCED: "#ef4444",
};
const RUN_COLOR: Record<string, string> = {
  ACTIVE: "#0ea5e9", COMPLETED: "#16a34a", EXITED: "#64748b", FAILED: "#ef4444",
};

function money(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function Loading() {
  return <div className="flex justify-center py-16"><Loader2 size={18} className="animate-spin text-gray-400" /></div>;
}
function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-gray-200 mb-2">{icon}</div>
      <p className="text-sm text-gray-400">{text}</p>
    </div>
  );
}

export default function ContactActivityPanel({
  contactId, counts,
}: {
  contactId: string;
  counts: { activity: number; transactions: number; tags: number; workflows: number };
}) {
  const [tab, setTab] = useState<TabKey>("activity");
  // Tabs render lazily on first open, then stay mounted (hidden) to avoid refetch.
  const [opened, setOpened] = useState<Set<TabKey>>(new Set(["activity"]));

  function select(k: TabKey) {
    setTab(k);
    setOpened((prev) => (prev.has(k) ? prev : new Set(prev).add(k)));
  }

  const tabs: { key: TabKey; label: string; icon: typeof Activity; count?: number }[] = [
    { key: "activity",     label: "Activity",     icon: Activity,     count: counts.activity },
    { key: "notes",        label: "Notes",        icon: StickyNote },
    { key: "emails",       label: "Emails",       icon: Mail },
    { key: "transactions", label: "Transactions", icon: Receipt,      count: counts.transactions },
    { key: "tags",         label: "Tag history",  icon: TagIcon,      count: counts.tags },
    { key: "workflows",    label: "Workflows",    icon: WorkflowIcon, count: counts.workflows },
  ];

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-1 px-4 sm:px-6 pt-4 overflow-x-auto overflow-y-hidden shrink-0 border-b border-gray-100">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => select(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-px whitespace-nowrap transition-colors ${
                active ? "border-blue-600 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              <Icon size={14} />
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${active ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}`}>
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
        {opened.has("activity") && <div className={tab === "activity" ? "" : "hidden"}><ActivityTab contactId={contactId} /></div>}
        {opened.has("notes") && <div className={tab === "notes" ? "" : "hidden"}><ContactNotes contactId={contactId} /></div>}
        {opened.has("emails") && <div className={tab === "emails" ? "" : "hidden"}><EmailsTab contactId={contactId} /></div>}
        {opened.has("transactions") && <div className={tab === "transactions" ? "" : "hidden"}><TransactionsTab contactId={contactId} /></div>}
        {opened.has("tags") && <div className={tab === "tags" ? "" : "hidden"}><TagsTab contactId={contactId} /></div>}
        {opened.has("workflows") && <div className={tab === "workflows" ? "" : "hidden"}><WorkflowsTab contactId={contactId} /></div>}
      </div>
    </div>
  );
}

function ActivityTab({ contactId }: { contactId: string }) {
  const { items, loading, loadingMore, hasMore, loadMore } = useCursorList<Event>(`/api/contacts/${contactId}/events`);
  if (loading) return <Loading />;
  if (items.length === 0) return <Empty icon={<CheckCircle size={32} />} text="No activity yet" />;
  return (
    <>
      <div className="relative">
        <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200" />
        <div className="space-y-1">
          {items.map((ev) => (
            <div key={ev.id} className="flex gap-4 relative">
              <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center shrink-0 z-10">
                {EVENT_ICON[ev.type] ?? <CheckCircle size={13} className="text-gray-400" />}
              </div>
              <div className="flex-1 bg-white border border-gray-100 rounded-xl px-4 py-2.5 mb-2 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gray-800">{EVENT_LABEL[ev.type] ?? ev.type}</p>
                  <span className="text-xs text-gray-400 shrink-0">{new Date(ev.createdAt).toLocaleString()}</span>
                </div>
                {ev.data && Object.keys(ev.data).length > 0 && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {Object.entries(ev.data).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      <LoadMore hasMore={hasMore} loading={loadingMore} onClick={loadMore} />
    </>
  );
}

function TransactionsTab({ contactId }: { contactId: string }) {
  const { items, loading, loadingMore, hasMore, loadMore } = useCursorList<Order>(`/api/contacts/${contactId}/transactions`);
  if (loading) return <Loading />;
  if (items.length === 0) return <Empty icon={<Receipt size={32} />} text="No transactions yet" />;
  return (
    <>
      <div className="space-y-2">
        {items.map((o) => (
          <div key={o.id} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CreditCard size={15} className="text-gray-400" />
                <span className="text-sm font-semibold text-gray-900">{money(o.total, o.currency)}</span>
                <Badge label={o.status} color={ORDER_COLOR[o.status] ?? "#64748b"} />
              </div>
              <span className="text-xs text-gray-400">{new Date(o.createdAt).toLocaleDateString()}</span>
            </div>
            {o.transactions.length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-50 space-y-1">
                {o.transactions.map((t) => (
                  <div key={t.id} className="flex items-center justify-between text-xs text-gray-500">
                    <span>{t.type} · {money(t.amount, t.currency)}</span>
                    <span>{t.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <LoadMore hasMore={hasMore} loading={loadingMore} onClick={loadMore} />
    </>
  );
}

function TagsTab({ contactId }: { contactId: string }) {
  const { items, loading, loadingMore, hasMore, loadMore } = useCursorList<Event>(`/api/contacts/${contactId}/events?kind=tags`);
  if (loading) return <Loading />;
  if (items.length === 0) return <Empty icon={<TagIcon size={32} />} text="No tag changes yet" />;
  return (
    <>
      <div className="space-y-2">
        {items.map((ev) => {
          const added = ev.type === "TAG_ADDED";
          return (
            <div key={ev.id} className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-4 py-2.5 shadow-sm">
              <span className={`w-2 h-2 rounded-full shrink-0 ${added ? "bg-emerald-500" : "bg-gray-300"}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800">
                  {added ? "Added" : "Removed"} <span className="font-medium">{ev.data?.tagName ?? "tag"}</span>
                </p>
              </div>
              <span className="text-xs text-gray-400 shrink-0">{new Date(ev.createdAt).toLocaleString()}</span>
            </div>
          );
        })}
      </div>
      <LoadMore hasMore={hasMore} loading={loadingMore} onClick={loadMore} />
    </>
  );
}

function WorkflowsTab({ contactId }: { contactId: string }) {
  const { items, loading, loadingMore, hasMore, loadMore } = useCursorList<Run>(`/api/contacts/${contactId}/workflow-runs`);
  if (loading) return <Loading />;
  if (items.length === 0) return <Empty icon={<WorkflowIcon size={32} />} text="Not in any workflow runs" />;
  return (
    <>
      <div className="space-y-2">
        {items.map((r) => (
          <div key={r.id} className="bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-gray-900 truncate">{r.workflowName}</span>
              <Badge label={r.status} color={RUN_COLOR[r.status] ?? "#64748b"} />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-1">
              <Clock size={11} />
              <span>Started {new Date(r.startedAt).toLocaleString()}</span>
              {r.completedAt && <span>· Ended {new Date(r.completedAt).toLocaleString()}</span>}
              {r.exitReason && <span>· {r.exitReason}</span>}
            </div>
          </div>
        ))}
      </div>
      <LoadMore hasMore={hasMore} loading={loadingMore} onClick={loadMore} />
    </>
  );
}

function EmailsTab({ contactId }: { contactId: string }) {
  const { items, loading, loadingMore, hasMore, loadMore } = useCursorList<EmailSend>(`/api/contacts/${contactId}/email-history`);
  if (loading) return <Loading />;
  if (items.length === 0) return <Empty icon={<Mail size={32} />} text="No emails sent yet" />;
  return (
    <>
      <div className="space-y-2">
        {items.map((s) => (
          <div key={s.id} className="bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-gray-800 truncate">{s.subject || "(no subject)"}</p>
              <Badge label={s.status} color={EMAIL_COLOR[s.status] ?? "#64748b"} />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-1">
              {s.sourceLabel && <span className="truncate">{s.sourceLabel}</span>}
              <span>· {new Date(s.sentAt ?? s.queuedAt).toLocaleString()}</span>
            </div>
            {s.errorMessage && <p className="text-xs text-red-500 mt-1">{s.errorMessage}</p>}
          </div>
        ))}
      </div>
      <LoadMore hasMore={hasMore} loading={loadingMore} onClick={loadMore} />
    </>
  );
}
