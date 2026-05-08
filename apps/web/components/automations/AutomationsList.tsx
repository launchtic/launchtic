"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus, Zap, Loader2, Search, Trash2, Play, Pause, FileEdit,
  ShoppingCart, FormInput, TagIcon, Tag as TagOff, MousePointerClick,
  Undo2, AlertTriangle,
} from "lucide-react";
import { useConfirm } from "../ui/ConfirmDialog";
import { useToast } from "../ui/Toast";
import RecipeDialog from "./RecipeDialog";

type Status = "DRAFT" | "ACTIVE" | "PAUSED";
type TriggerType = "NEW_SALE" | "SALE_CANCELED" | "SUBSCRIPTION_PAYMENT_FAILED" | "FORM_SUBMIT" | "TAG_ADDED" | "TAG_REMOVED" | "EMAIL_LINK_CLICKED";

type Row = {
  id: string;
  name: string;
  status: Status;
  triggerType: TriggerType;
  triggerConfig: Record<string, unknown>;
  timesTriggered: number;
  lastTriggeredAt: string | null;
  actionCount: number;
};

const TRIGGER_LABELS: Record<TriggerType, { label: string; Icon: typeof Zap }> = {
  NEW_SALE:                    { label: "New sale",                    Icon: ShoppingCart       },
  SALE_CANCELED:               { label: "Sale canceled",               Icon: Undo2              },
  SUBSCRIPTION_PAYMENT_FAILED: { label: "Subscription payment failed", Icon: AlertTriangle      },
  FORM_SUBMIT:                 { label: "Form submitted",              Icon: FormInput          },
  TAG_ADDED:                   { label: "Tag added",                   Icon: TagIcon            },
  TAG_REMOVED:                 { label: "Tag removed",                 Icon: TagOff             },
  EMAIL_LINK_CLICKED:          { label: "Email link clicked",          Icon: MousePointerClick  },
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

export default function AutomationsList({ initial }: { initial: Row[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [items, setItems] = useState<Row[]>(initial);
  const [tab, setTab] = useState<"ALL" | Status>("ALL");
  const [search, setSearch] = useState("");
  const [recipeOpen, setRecipeOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = items;
    if (tab !== "ALL") list = list.filter((a) => a.status === tab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((a) => a.name.toLowerCase().includes(q));
    }
    return list;
  }, [items, tab, search]);

  function handleCreate() {
    setRecipeOpen(true);
  }

  async function toggleStatus(a: Row) {
    const next: Status = a.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    setBusy(a.id);
    const res = await fetch(`/api/automations/${a.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    const json = await res.json();
    setBusy(null);
    if (!json.success) { toast.error(json.error ?? "Failed to update status"); return; }
    setItems((prev) => prev.map((x) => (x.id === a.id ? { ...x, status: next } : x)));
  }

  async function handleDelete(a: Row) {
    const ok = await confirm({
      title: "Delete automation?",
      description: `"${a.name}" and all its run history will be removed.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;

    setBusy(a.id);
    const res = await fetch(`/api/automations/${a.id}`, { method: "DELETE" });
    const json = await res.json();
    setBusy(null);
    if (json.success) setItems((prev) => prev.filter((x) => x.id !== a.id));
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Zap size={20} className="text-gray-700" /> Automations
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Run actions automatically when something happens — orders, form submissions, tag changes.
          </p>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shrink-0"
        >
          <Plus size={14} />
          New automation
        </button>
      </div>

      {/* Filter + Search */}
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

      {/* List */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-200 rounded-xl py-16 px-4 text-center">
          <Zap size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-500 mb-4">
            {items.length === 0 ? "No automations yet. Start with a recipe or build from scratch." : "No automations match your filters."}
          </p>
          {items.length === 0 && (
            <button
              onClick={() => setRecipeOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors"
            >
              <Plus size={14} /> Browse recipes
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          {filtered.map((a) => {
            const trig = TRIGGER_LABELS[a.triggerType];
            return (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors">
                <Link href={`/automations/${a.id}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-gray-900 truncate">{a.name}</span>
                    <span className={`text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded shrink-0 ${STATUS_BADGE[a.status]}`}>
                      {a.status.toLowerCase()}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 flex items-center gap-3">
                    <span className="inline-flex items-center gap-1">
                      <trig.Icon size={11} />
                      {trig.label}
                    </span>
                    <span>·</span>
                    <span>{a.actionCount} action{a.actionCount !== 1 ? "s" : ""}</span>
                    <span>·</span>
                    <span>{a.timesTriggered.toLocaleString()} runs</span>
                  </p>
                </Link>
                <div className="flex items-center gap-1 shrink-0">
                  {a.status !== "DRAFT" && a.actionCount > 0 && (
                    <button
                      onClick={() => toggleStatus(a)}
                      disabled={busy === a.id}
                      className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                        a.status === "ACTIVE"
                          ? "text-amber-600 hover:bg-amber-50"
                          : "text-emerald-600 hover:bg-emerald-50"
                      }`}
                      title={a.status === "ACTIVE" ? "Pause" : "Activate"}
                    >
                      {busy === a.id
                        ? <Loader2 size={14} className="animate-spin" />
                        : a.status === "ACTIVE" ? <Pause size={14} /> : <Play size={14} />}
                    </button>
                  )}
                  <Link
                    href={`/automations/${a.id}`}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Edit"
                  >
                    <FileEdit size={14} />
                  </Link>
                  <button
                    onClick={() => handleDelete(a)}
                    disabled={busy === a.id}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                    title="Delete"
                  >
                    {busy === a.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <RecipeDialog open={recipeOpen} onClose={() => setRecipeOpen(false)} />
    </div>
  );
}
