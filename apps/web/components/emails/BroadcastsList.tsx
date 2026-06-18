"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  Plus, Megaphone, Loader2, Search, Trash2, Clock, CheckCircle, AlertCircle, Send, FileEdit, Ban,
  Pencil, Check, X,
} from "lucide-react";
import { WELCOME_EMAIL_DOC } from "@launchtic/email";
import { useConfirm } from "../ui/ConfirmDialog";
import { useToast } from "../ui/Toast";
import { useRole } from "../../lib/role";
import { apiFetch } from "../../lib/api-client";

type Status = "DRAFT" | "SCHEDULED" | "SENDING" | "SENT" | "FAILED" | "CANCELED";
type Target = "ALL_CONTACTS" | "TAG" | "SEGMENT";

type Row = {
  id: string;
  name: string;
  subject: string;
  status: Status;
  scheduledAt: string | null;
  sentAt: string | null;
  targetType: Target;
  targetTagIds: string[];
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
};

const STATUS_BADGE: Record<Status, { label: string; cls: string; Icon: typeof Send }> = {
  DRAFT:     { label: "Draft",     cls: "bg-gray-100 text-gray-700",         Icon: FileEdit    },
  SCHEDULED: { label: "Scheduled", cls: "bg-amber-50 text-amber-700",        Icon: Clock       },
  SENDING:   { label: "Sending",   cls: "bg-blue-50 text-blue-700",          Icon: Loader2     },
  SENT:      { label: "Sent",      cls: "bg-emerald-50 text-emerald-700",    Icon: CheckCircle },
  FAILED:    { label: "Failed",    cls: "bg-red-50 text-red-700",            Icon: AlertCircle },
  CANCELED:  { label: "Canceled",  cls: "bg-gray-100 text-gray-500",         Icon: Ban         },
};

const TABS: { id: "ALL" | Status; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "DRAFT", label: "Drafts" },
  { id: "SCHEDULED", label: "Scheduled" },
  { id: "SENT", label: "Sent" },
];

export default function BroadcastsList({ initial }: { initial: Row[] }) {
  const router = useRouter();
  const params = useParams();
  const slug = params.workspaceSlug as string;
  const confirm = useConfirm();
  const toast = useToast();
  const [items, setItems] = useState<Row[]>(initial);
  const [tab, setTab] = useState<"ALL" | Status>("ALL");
  const [search, setSearch] = useState("");
  const [creating, startCreate] = useTransition();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [savingRename, setSavingRename] = useState(false);
  const { canManageBroadcasts } = useRole();

  const filtered = useMemo(() => {
    let list = items;
    if (tab !== "ALL") list = list.filter((b) => b.status === tab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (b) => b.name.toLowerCase().includes(q) || b.subject.toLowerCase().includes(q),
      );
    }
    return list;
  }, [items, tab, search]);

  function handleCreate() {
    startCreate(async () => {
      const res = await apiFetch("/api/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Untitled broadcast",
          subject: "Subject line",
          htmlBody: WELCOME_EMAIL_DOC,
          targetType: "TAG",
          targetTagIds: [],
        }),
      });
      const json = await res.json();
      if (json.success) router.push(`/${slug}/broadcast-editor/${json.data.id}`);
      else toast.error(json.error ?? "Failed to create broadcast");
    });
  }

  async function handleDelete(b: Row) {
    const ok = await confirm({
      title: "Delete broadcast?",
      description: `"${b.name}" will be permanently removed.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;

    setDeleting(b.id);
    const res = await apiFetch(`/api/broadcasts/${b.id}`, { method: "DELETE" });
    const json = await res.json();
    setDeleting(null);
    if (json.success) setItems((prev) => prev.filter((x) => x.id !== b.id));
    else toast.error(json.error ?? "Failed to delete");
  }

  function startRename(b: Row) {
    setRenamingId(b.id);
    setRenameValue(b.name);
  }

  async function saveRename(b: Row) {
    const name = renameValue.trim();
    if (!name || name === b.name) {
      setRenamingId(null);
      return;
    }
    setSavingRename(true);
    const res = await apiFetch(`/api/broadcasts/${b.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const json = await res.json();
    setSavingRename(false);
    if (json.success) {
      setItems((prev) => prev.map((x) => (x.id === b.id ? { ...x, name } : x)));
      setRenamingId(null);
    } else {
      toast.error(json.error ?? "Failed to rename");
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Megaphone size={20} className="text-gray-700" /> Broadcasts
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            One-time email campaigns sent to your contacts.
          </p>
        </div>
        {canManageBroadcasts && (
          <button
            onClick={handleCreate}
            disabled={creating}
            className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl transition-colors shrink-0"
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            New broadcast
          </button>
        )}
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <select
          value={tab}
          onChange={(e) => setTab(e.target.value as "ALL" | Status)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-fit"
        >
          {TABS.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
        <div className="relative flex-1 sm:max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or subject..."
            className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-300"
          />
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-200 rounded-xl py-16 text-center">
          <Megaphone size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">
            {items.length === 0 ? "No broadcasts yet. Create your first one." : "No broadcasts match your filters."}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          {filtered.map((b) => {
            const badge = STATUS_BADGE[b.status];
            const dateLabel = b.sentAt
              ? `Sent ${new Date(b.sentAt).toLocaleString()}`
              : b.scheduledAt
                ? `Scheduled ${new Date(b.scheduledAt).toLocaleString()}`
                : `Created ${new Date(b.createdAt).toLocaleDateString()}`;
            return (
              <div key={b.id} className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors">
                {renamingId === b.id ? (
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveRename(b);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      disabled={savingRename}
                      className="flex-1 min-w-0 border border-blue-500 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    />
                    <button
                      onClick={() => saveRename(b)}
                      disabled={savingRename}
                      className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50 shrink-0"
                      title="Save"
                    >
                      {savingRename ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    </button>
                    <button
                      onClick={() => setRenamingId(null)}
                      disabled={savingRename}
                      className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 shrink-0"
                      title="Cancel"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <Link href={`/${slug}/broadcast-editor/${b.id}`} className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium text-gray-900 truncate">{b.name}</span>
                      <span className={`inline-flex items-center gap-1 text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded ${badge.cls} shrink-0`}>
                        <badge.Icon size={10} className={b.status === "SENDING" ? "animate-spin" : ""} />
                        {badge.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">{b.subject}</p>
                  </Link>
                )}
                {renamingId !== b.id && (
                  <div className="hidden md:flex flex-col items-end gap-0.5 shrink-0">
                    <span className="text-xs text-gray-400">{dateLabel}</span>
                    {b.status === "SENT" && (
                      <span className="text-xs text-gray-500">
                        {b.sentCount.toLocaleString()} / {b.totalRecipients.toLocaleString()} sent
                        {b.failedCount > 0 && (
                          <span className="text-red-500 ml-1">({b.failedCount} failed)</span>
                        )}
                      </span>
                    )}
                  </div>
                )}
                {canManageBroadcasts && renamingId !== b.id && b.status !== "SENDING" && (
                  <button
                    onClick={() => startRename(b)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors shrink-0"
                    title="Rename"
                  >
                    <Pencil size={14} />
                  </button>
                )}
                {canManageBroadcasts && renamingId !== b.id && b.status !== "SENDING" && (
                  <button
                    onClick={() => handleDelete(b)}
                    disabled={deleting === b.id}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 shrink-0"
                    title="Delete"
                  >
                    {deleting === b.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
