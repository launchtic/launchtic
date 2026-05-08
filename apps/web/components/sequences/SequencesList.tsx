"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus, Repeat, Loader2, Search, Trash2, Play, Pause, FileEdit,
} from "lucide-react";
import { WELCOME_EMAIL_DOC } from "@launchtic/email";
import { useConfirm } from "../ui/ConfirmDialog";
import { useToast } from "../ui/Toast";

type Status = "DRAFT" | "ACTIVE" | "PAUSED";

type Row = {
  id: string;
  name: string;
  status: Status;
  totalEnrolled: number;
  activeCount: number;
  completedCount: number;
  exitedCount: number;
  stepCount: number;
};

const STATUS_BADGE: Record<Status, string> = {
  DRAFT:  "bg-gray-100 text-gray-600",
  ACTIVE: "bg-emerald-50 text-emerald-700",
  PAUSED: "bg-amber-50 text-amber-700",
};

const TABS: { id: "ALL" | Status; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "ACTIVE", label: "Active" },
  { id: "PAUSED", label: "Paused" },
  { id: "DRAFT", label: "Drafts" },
];

export default function SequencesList({ initial }: { initial: Row[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [items, setItems] = useState<Row[]>(initial);
  const [tab, setTab] = useState<"ALL" | Status>("ALL");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = items;
    if (tab !== "ALL") list = list.filter((s) => s.status === tab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q));
    }
    return list;
  }, [items, tab, search]);

  async function handleCreate() {
    setCreating(true);
    const res = await fetch("/api/sequences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Untitled sequence",
        steps: [
          {
            delayMinutes: 0,
            emailSubject: "Welcome!",
            emailHtmlBody: WELCOME_EMAIL_DOC,
          },
        ],
      }),
    });
    const json = await res.json();
    setCreating(false);
    if (json.success) router.push(`/sequences/${json.data.id}`);
    else toast.error(json.error ?? "Failed to create sequence");
  }

  async function toggleStatus(s: Row) {
    const next: Status = s.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    setBusy(s.id);
    const res = await fetch(`/api/sequences/${s.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    const json = await res.json();
    setBusy(null);
    if (!json.success) { toast.error(json.error ?? "Failed to update status"); return; }
    setItems((prev) => prev.map((x) => (x.id === s.id ? { ...x, status: next } : x)));
  }

  async function handleDelete(s: Row) {
    const ok = await confirm({
      title: "Delete sequence?",
      description: `"${s.name}" and all enrollments will be removed. Active enrollments will stop receiving emails.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;

    setBusy(s.id);
    const res = await fetch(`/api/sequences/${s.id}`, { method: "DELETE" });
    const json = await res.json();
    setBusy(null);
    if (json.success) setItems((prev) => prev.filter((x) => x.id !== s.id));
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Repeat size={20} className="text-gray-700" /> Sequences
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Drip campaigns — automated email series sent on a schedule (Day 0, 3, 7, …) per enrolled contact.
          </p>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shrink-0 disabled:opacity-50"
        >
          {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          New sequence
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <select
          value={tab}
          onChange={(e) => setTab(e.target.value as "ALL" | Status)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 sm:w-44"
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
            placeholder="Search by name..."
            className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-300"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-200 rounded-xl py-16 px-4 text-center">
          <Repeat size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-500 mb-4">
            {items.length === 0 ? "No sequences yet — create your first drip campaign." : "No sequences match your filters."}
          </p>
          {items.length === 0 && (
            <button
              onClick={handleCreate}
              disabled={creating}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors disabled:opacity-50"
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              New sequence
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          {filtered.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors">
              <Link href={`/sequences/${s.id}`} className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-gray-900 truncate">{s.name}</span>
                  <span className={`text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded shrink-0 ${STATUS_BADGE[s.status]}`}>
                    {s.status.toLowerCase()}
                  </span>
                </div>
                <p className="text-xs text-gray-500 flex items-center gap-3 flex-wrap">
                  <span>{s.stepCount} step{s.stepCount !== 1 ? "s" : ""}</span>
                  <span>·</span>
                  <span>{s.activeCount.toLocaleString()} active</span>
                  <span>·</span>
                  <span>{s.completedCount.toLocaleString()} completed</span>
                  {s.exitedCount > 0 && (
                    <>
                      <span>·</span>
                      <span>{s.exitedCount.toLocaleString()} exited</span>
                    </>
                  )}
                </p>
              </Link>
              <div className="flex items-center gap-1 shrink-0">
                {s.status !== "DRAFT" && s.stepCount > 0 && (
                  <button
                    onClick={() => toggleStatus(s)}
                    disabled={busy === s.id}
                    className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                      s.status === "ACTIVE"
                        ? "text-amber-600 hover:bg-amber-50"
                        : "text-emerald-600 hover:bg-emerald-50"
                    }`}
                    title={s.status === "ACTIVE" ? "Pause" : "Activate"}
                  >
                    {busy === s.id
                      ? <Loader2 size={14} className="animate-spin" />
                      : s.status === "ACTIVE" ? <Pause size={14} /> : <Play size={14} />}
                  </button>
                )}
                <Link
                  href={`/sequences/${s.id}`}
                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="Edit"
                >
                  <FileEdit size={14} />
                </Link>
                <button
                  onClick={() => handleDelete(s)}
                  disabled={busy === s.id}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                  title="Delete"
                >
                  {busy === s.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
