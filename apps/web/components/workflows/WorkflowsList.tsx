"use client";

import { useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  Plus, Workflow, Loader2, Search, Trash2, Play, Pause, FileEdit, Sparkles,
  ShoppingCart, FormInput, Tag as TagIcon, Tag as TagOff, MousePointerClick,
  Undo2, AlertTriangle,
} from "lucide-react";
import { useConfirm } from "../ui/ConfirmDialog";
import { useToast } from "../ui/Toast";
import { useRole } from "../../lib/role";
import { apiFetch } from "../../lib/api-client";
import TemplateGallery from "./TemplateGallery";

type Status = "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
type TriggerType =
  | "NEW_SALE" | "SALE_CANCELED" | "SUBSCRIPTION_PAYMENT_FAILED"
  | "FORM_SUBMIT" | "TAG_ADDED" | "TAG_REMOVED" | "EMAIL_LINK_CLICKED";

type Row = {
  id: string;
  name: string;
  description: string | null;
  status: Status;
  triggerType: string;
  triggerConfig: Record<string, unknown> | null;
  hasStartNode: boolean;
  totalEnrolled: number;
  activeCount:   number;
  completedCount: number;
  nodeCount: number;
  lastTriggeredAt: string | null;
  updatedAt: string;
};

const TRIGGER_LABELS: Record<string, { label: string; Icon: typeof Workflow }> = {
  NEW_SALE:                    { label: "New sale",                    Icon: ShoppingCart       },
  SALE_CANCELED:               { label: "Sale canceled",               Icon: Undo2              },
  SUBSCRIPTION_PAYMENT_FAILED: { label: "Subscription payment failed", Icon: AlertTriangle      },
  FORM_SUBMIT:                 { label: "Form submitted",              Icon: FormInput          },
  TAG_ADDED:                   { label: "Tag added",                   Icon: TagIcon            },
  TAG_REMOVED:                 { label: "Tag removed",                 Icon: TagOff             },
  EMAIL_LINK_CLICKED:          { label: "Email link clicked",          Icon: MousePointerClick  },
  CHECKOUT_STARTED:            { label: "Checkout started",            Icon: ShoppingCart       },
};

const STATUS_BADGE: Record<Status, string> = {
  DRAFT:    "bg-gray-100 text-gray-600",
  ACTIVE:   "bg-emerald-50 text-emerald-700",
  PAUSED:   "bg-amber-50 text-amber-700",
  ARCHIVED: "bg-gray-100 text-gray-500",
};

const TABS: { id: "ALL" | Status; label: string }[] = [
  { id: "ALL",      label: "All" },
  { id: "ACTIVE",   label: "Active" },
  { id: "PAUSED",   label: "Paused" },
  { id: "DRAFT",    label: "Drafts" },
  { id: "ARCHIVED", label: "Archived" },
];

export default function WorkflowsList({ initial }: { initial: Row[] }) {
  const router  = useRouter();
  const params  = useParams();
  const slug    = params.workspaceSlug as string;
  const confirm = useConfirm();
  const toast   = useToast();
  const [items, setItems]   = useState<Row[]>(initial);
  const [tab, setTab]       = useState<"ALL" | Status>("ALL");
  const [search, setSearch] = useState("");
  const [busy, setBusy]     = useState<string | null>(null);
  const [showGallery, setShowGallery] = useState(false);
  const { canManageAutomations } = useRole();

  const filtered = useMemo(() => {
    let list = items;
    if (tab !== "ALL") list = list.filter((w) => w.status === tab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((w) => w.name.toLowerCase().includes(q) || (w.description ?? "").toLowerCase().includes(q));
    }
    return list;
  }, [items, tab, search]);

  async function handleCreate() {
    setBusy("__new");
    const res = await apiFetch("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Untitled workflow",
        triggerType: "NEW_SALE",
        triggerConfig: {},
        nodes: [],
        edges: [],
      }),
    });
    const json = await res.json();
    setBusy(null);
    if (!json.success) { toast.error(json.error ?? "Failed to create workflow"); return; }
    router.push(`/${slug}/workflows/${json.data.id}`);
  }

  async function toggleStatus(w: Row) {
    const next: Status = w.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    setBusy(w.id);
    const res = await apiFetch(`/api/workflows/${w.id}/status`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ status: next }),
    });
    const json = await res.json();
    setBusy(null);
    if (!json.success) { toast.error(json.error ?? "Failed to update status"); return; }
    setItems((prev) => prev.map((x) => (x.id === w.id ? { ...x, status: next } : x)));
  }

  async function handleDelete(w: Row) {
    const ok = await confirm({
      title: "Delete workflow?",
      description: `"${w.name}" and all its run history will be removed.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    setBusy(w.id);
    const res  = await apiFetch(`/api/workflows/${w.id}`, { method: "DELETE" });
    const json = await res.json();
    setBusy(null);
    if (json.success) setItems((prev) => prev.filter((x) => x.id !== w.id));
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Workflow size={20} className="text-gray-700" /> Workflows
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Build visual workflows that respond to your funnel and customer events.
          </p>
        </div>
        {canManageAutomations && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowGallery(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors"
            >
              <Sparkles size={14} className="text-amber-500" />
              Browse templates
            </button>
            <button
              onClick={handleCreate}
              disabled={busy === "__new"}
              className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors disabled:opacity-50"
            >
              {busy === "__new" ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              New workflow
            </button>
          </div>
        )}
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
          <Workflow size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-500 mb-4">
            {items.length === 0 ? "No workflows yet. Build one to automate your funnel response." : "No workflows match your filters."}
          </p>
          {items.length === 0 && canManageAutomations && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setShowGallery(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-90 rounded-xl transition-opacity"
              >
                <Sparkles size={14} /> Start from template
              </button>
              <button
                onClick={handleCreate}
                disabled={busy === "__new"}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors disabled:opacity-50"
              >
                {busy === "__new" ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Blank workflow
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          {filtered.map((w) => {
            const trig = TRIGGER_LABELS[w.triggerType] ?? { label: w.triggerType, Icon: Workflow };
            return (
              <div key={w.id} className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors">
                <Link href={`/${slug}/workflows/${w.id}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-gray-900 truncate">{w.name}</span>
                    <span className={`text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded shrink-0 ${STATUS_BADGE[w.status]}`}>
                      {w.status.toLowerCase()}
                    </span>
                    {!w.hasStartNode && (
                      <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 shrink-0">
                        empty
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 flex items-center gap-3">
                    <span className="inline-flex items-center gap-1">
                      <trig.Icon size={11} />
                      {trig.label}
                    </span>
                    <span>·</span>
                    <span>{w.nodeCount} node{w.nodeCount !== 1 ? "s" : ""}</span>
                    <span>·</span>
                    <span>{w.activeCount.toLocaleString()} active</span>
                    <span>·</span>
                    <span>{w.totalEnrolled.toLocaleString()} runs</span>
                  </p>
                </Link>
                <div className="flex items-center gap-1 shrink-0">
                  {w.status !== "DRAFT" && w.status !== "ARCHIVED" && (
                    <button
                      onClick={() => toggleStatus(w)}
                      disabled={busy === w.id}
                      className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                        w.status === "ACTIVE"
                          ? "text-amber-600 hover:bg-amber-50"
                          : "text-emerald-600 hover:bg-emerald-50"
                      }`}
                      title={w.status === "ACTIVE" ? "Pause" : "Activate"}
                    >
                      {busy === w.id
                        ? <Loader2 size={14} className="animate-spin" />
                        : w.status === "ACTIVE" ? <Pause size={14} /> : <Play size={14} />}
                    </button>
                  )}
                  <Link
                    href={`/${slug}/workflows/${w.id}`}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Edit"
                  >
                    <FileEdit size={14} />
                  </Link>
                  {canManageAutomations && (
                    <button
                      onClick={() => handleDelete(w)}
                      disabled={busy === w.id}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                      title="Delete"
                    >
                      {busy === w.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {showGallery && <TemplateGallery onClose={() => setShowGallery(false)} />}
    </div>
  );
}
