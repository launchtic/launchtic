"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import {
  Search, ChevronLeft, ChevronRight, Loader2, Zap, Eye, Settings, Trash2, Plus,
  Undo2,
} from "lucide-react";
import FunnelFormDrawer from "./FunnelFormDrawer";
import { useConfirm } from "../ui/ConfirmDialog";
import { useToast } from "../ui/Toast";
import { useRole } from "../../lib/role";
import { apiFetch } from "../../lib/api-client";
import ExportButton from "../ui/ExportButton";

type Domain = { domain: string; verified: boolean };
type Funnel = {
  id: string;
  name: string;
  createdAt: string;
  steps: { id: string; slug: string }[];
  domains: { domain: Domain }[];
};
type PageMeta = { total: number; page: number; pageSize: number; totalPages: number };

function viewUrl(rendererUrl: string, primaryDomain: string | null, slug: string) {
  if (primaryDomain) {
    const { port, protocol } = new URL(rendererUrl);
    const portSuffix = port ? `:${port}` : "";
    return `${protocol}//${primaryDomain}${portSuffix}/${slug}`;
  }
  return `${rendererUrl}/${slug}`;
}

type View = "active" | "trash";

export default function FunnelsClient({
  initialTotal = 0,
  rendererUrl,
}: {
  initialTotal?: number;
  rendererUrl: string;
}) {
  const [items, setItems] = useState<Funnel[]>([]);
  const [meta, setMeta] = useState<PageMeta>({ total: initialTotal, page: 1, pageSize: 25, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [view, setView] = useState<View>("active");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const params = useParams();
  const slug = params.workspaceSlug as string;
  const confirm = useConfirm();
  const toast = useToast();
  const { canManageFunnels, canDeleteFunnels } = useRole();

  const fetchData = useCallback(async (q: string, p: number, v: View) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), pageSize: "25" });
    if (q) params.set("search", q);
    params.set("status", v === "trash" ? "TRASHED" : "ACTIVE");
    const res = await apiFetch(`/api/funnels?${params}`);
    const json = await res.json();
    if (json.success) {
      setItems(json.data.items);
      setMeta({ total: json.data.total, page: json.data.page, pageSize: json.data.pageSize, totalPages: json.data.totalPages });
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(search, page, view); }, [fetchData, page, view]);

  function handleSearch(val: string) {
    setSearch(val);
    setPage(1);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchData(val, 1, view), 350);
  }

  function switchView(next: View) {
    if (next === view) return;
    setView(next);
    setPage(1);
    setSearch("");
  }

  async function handleMoveToTrash(funnel: Funnel) {
    const ok = await confirm({
      title: `Move "${funnel.name}" to trash?`,
      description: "You can restore it later from the Trash tab.",
      confirmLabel: "Move to Trash",
      variant: "danger",
    });
    if (!ok) return;
    setBusyId(funnel.id);
    const res = await apiFetch(`/api/funnels/${funnel.id}`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      toast.error(json.error ?? "Failed to move funnel to trash");
      return;
    }
    fetchData(search, page, view);
    router.refresh();
  }

  async function handleRestore(funnel: Funnel) {
    setBusyId(funnel.id);
    const res = await apiFetch(`/api/funnels/${funnel.id}/restore`, { method: "POST" });
    setBusyId(null);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      toast.error(json.error ?? "Failed to restore funnel");
      return;
    }
    fetchData(search, page, view);
    router.refresh();
  }

  async function handleDeleteForever(funnel: Funnel) {
    const ok = await confirm({
      title: `Permanently delete "${funnel.name}"?`,
      description: "This cannot be undone. All steps and data will be deleted.",
      confirmLabel: "Delete Forever",
      variant: "danger",
    });
    if (!ok) return;
    setBusyId(funnel.id);
    const res = await apiFetch(`/api/funnels/${funnel.id}?permanent=1`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      toast.error(json.error ?? "Failed to delete funnel");
      return;
    }
    fetchData(search, page, view);
    router.refresh();
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 px-4 sm:px-6 py-4 shrink-0">
        <div className="shrink-0">
          <h1 className="text-xl font-bold text-gray-900">Funnels</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {meta.total} {meta.total === 1 ? "funnel" : "funnels"}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 lg:flex-1 lg:justify-end">
          {/* Active / Trash tabs */}
          <div className="inline-flex items-center bg-gray-100 rounded-xl p-1 shrink-0">
            <button
              onClick={() => switchView("active")}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                view === "active" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Active
            </button>
            <button
              onClick={() => switchView("trash")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                view === "trash" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Trash2 size={12} />
              Trash
            </button>
          </div>
          <div className="relative sm:flex-1 lg:max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search funnels…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
          {view === "active" && canManageFunnels && (
            <button
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors shrink-0"
            >
              <Plus size={16} />
              New Funnel
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-4 sm:px-6 pb-4">
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={20} className="animate-spin text-gray-400" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 ${
              view === "trash" ? "bg-gray-100" : "bg-blue-50"
            }`}>
              {view === "trash" ? (
                <Trash2 size={20} className="text-gray-400" />
              ) : (
                <Zap size={20} className="text-blue-500" />
              )}
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">
              {view === "trash" ? "Trash is empty" : "No funnels yet"}
            </p>
            <p className="text-xs text-gray-400">
              {view === "trash"
                ? "Deleted funnels will appear here"
                : search ? "No funnels match your search" : "Create your first funnel to get started"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <th className="text-left px-6 py-3 font-semibold">Name</th>
                <th className="text-left px-4 py-3 font-semibold">Steps</th>
                <th className="text-left px-4 py-3 font-semibold">Domain</th>
                <th className="text-left px-4 py-3 font-semibold">Created</th>
                <th className="text-right px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((f) => {
                const primaryDomain = f.domains[0]?.domain.verified ? f.domains[0].domain.domain : null;
                const firstSlug = f.steps[0]?.slug;
                const liveUrl = firstSlug ? viewUrl(rendererUrl, primaryDomain, firstSlug) : null;
                return (
                  <tr key={f.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-6 py-3">
                      <Link href={`/${slug}/funnels/${f.id}`} className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                          <span className="text-blue-500 text-xs font-bold">F</span>
                        </div>
                        <span className="font-medium text-gray-900 group-hover:text-blue-700 transition-colors truncate">
                          {f.name}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {f.steps.length} {f.steps.length === 1 ? "step" : "steps"}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {primaryDomain ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {new Date(f.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {view === "active" && liveUrl && (
                          <a
                            href={liveUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                          >
                            <Eye size={14} />
                          </a>
                        )}
                        {view === "active" ? (
                          <>
                            <ExportButton url={`/api/funnels/${f.id}/export-bundle`} filename={`${f.name}.ltbundle`} />
                            {canManageFunnels && (
                              <button
                                onClick={() => setEditId(f.id)}
                                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                              >
                                <Settings size={14} />
                              </button>
                            )}
                            {canManageFunnels && (
                              <button
                                onClick={() => handleMoveToTrash(f)}
                                disabled={busyId === f.id}
                                title="Move to Trash"
                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                              >
                                {busyId === f.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                              </button>
                            )}
                          </>
                        ) : (
                          <>
                            {canManageFunnels && (
                              <button
                                onClick={() => handleRestore(f)}
                                disabled={busyId === f.id}
                                title="Restore"
                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                              >
                                {busyId === f.id ? <Loader2 size={14} className="animate-spin" /> : <Undo2 size={14} />}
                              </button>
                            )}
                            {canDeleteFunnels && (
                              <button
                                onClick={() => handleDeleteForever(f)}
                                disabled={busyId === f.id}
                                title="Delete Forever"
                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                              >
                                {busyId === f.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}

        {meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              {(meta.page - 1) * meta.pageSize + 1}–{Math.min(meta.page * meta.pageSize, meta.total)} / {meta.total}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={meta.page === 1}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="px-2 text-xs text-gray-600">{meta.page} / {meta.totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                disabled={meta.page === meta.totalPages}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-30 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
        </div>
      </div>

      <FunnelFormDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        mode="create"
        onSuccess={(id) => {
          setCreateOpen(false);
          router.push(`/${slug}/funnels/${id}`);
        }}
      />

      <FunnelFormDrawer
        open={editId !== null}
        onClose={() => setEditId(null)}
        mode="edit"
        editId={editId ?? undefined}
        onSuccess={() => { setEditId(null); fetchData(search, page, view); }}
      />
    </div>
  );
}
