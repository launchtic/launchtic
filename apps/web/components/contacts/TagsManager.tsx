"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Search, ChevronLeft, ChevronRight, ChevronRight as BreadArrow,
  Plus, Trash2, Pencil, Loader2, Tag,
} from "lucide-react";
import { useConfirm } from "../ui/ConfirmDialog";
import FormDrawer from "../ui/FormDrawer";
import { useRole } from "../../lib/role";

type TagRow = { id: string; name: string; color: string | null; _count?: { contacts: number }; count?: number };
type PageMeta = { total: number; page: number; pageSize: number; totalPages: number };

const PRESET_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#3b82f6", "#64748b",
];

function tagCount(t: TagRow): number {
  return t._count?.contacts ?? t.count ?? 0;
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
          style={{ backgroundColor: c, borderColor: value === c ? "#1d4ed8" : "transparent" }}
        />
      ))}
    </div>
  );
}

export default function TagsManager({ initialTotal = 0 }: { initialTotal?: number }) {
  const params = useParams();
  const slug = params.workspaceSlug as string;
  const [items, setItems] = useState<TagRow[]>([]);
  const [meta, setMeta] = useState<PageMeta>({ total: initialTotal, page: 1, pageSize: 25, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit" | null>(null);
  const [editingTag, setEditingTag] = useState<TagRow | null>(null);
  const [formName, setFormName] = useState("");
  const [formColor, setFormColor] = useState(PRESET_COLORS[0]);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirm = useConfirm();
  const { canWrite } = useRole();

  const fetchData = useCallback(async (q: string, p: number) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), pageSize: "25" });
    if (q) params.set("search", q);
    const res = await fetch(`/api/tags?${params}`);
    const json = await res.json();
    if (json.success) {
      setItems(json.data.items);
      setMeta({ total: json.data.total, page: json.data.page, pageSize: json.data.pageSize, totalPages: json.data.totalPages });
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(search, page); }, [fetchData, page]);

  function handleSearch(val: string) {
    setSearch(val);
    setPage(1);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchData(val, 1), 350);
  }

  function openCreate() {
    setDrawerMode("create");
    setEditingTag(null);
    setFormName("");
    setFormColor(PRESET_COLORS[0]);
    setFormError("");
  }

  function openEdit(tag: TagRow) {
    setDrawerMode("edit");
    setEditingTag(tag);
    setFormName(tag.name);
    setFormColor(tag.color ?? PRESET_COLORS[0]);
    setFormError("");
  }

  function closeDrawer() {
    if (submitting) return;
    setDrawerMode(null);
    setEditingTag(null);
  }

  async function handleSubmit() {
    const name = formName.trim();
    if (!name) { setFormError("Name is required"); return; }
    setSubmitting(true);
    setFormError("");
    try {
      const url = drawerMode === "edit" && editingTag ? `/api/tags/${editingTag.id}` : "/api/tags";
      const method = drawerMode === "edit" ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color: formColor }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save");
      setDrawerMode(null);
      setEditingTag(null);
      fetchData(search, page);
    } catch (err: any) {
      setFormError(err.message ?? "Failed to save");
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteTag(tag: TagRow) {
    const ok = await confirm({
      title: `Delete tag "${tag.name}"?`,
      description: "This will remove the tag from all contacts.",
      variant: "danger",
    });
    if (!ok) return;
    setDeleting(tag.id);
    await fetch(`/api/tags/${tag.id}`, { method: "DELETE" });
    setDeleting(null);
    fetchData(search, page);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 px-4 sm:px-6 py-4 shrink-0">
        <div>
          <nav className="flex items-center gap-1 text-xs text-gray-400 mb-1">
            <Link href={`/${slug}/contacts`} className="hover:text-blue-600">Contacts</Link>
            <BreadArrow size={11} />
            <span className="text-gray-700 font-medium">Tags</span>
          </nav>
          <h1 className="text-xl font-bold text-gray-900">Tags</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {meta.total} {meta.total === 1 ? "tag" : "tags"}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 lg:flex-1 lg:justify-end">
          <div className="relative sm:flex-1 lg:max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search tags…"
              className="w-full pl-9 pr-3 py-2 text-base sm:text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
          {canWrite && (
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shrink-0"
            >
              <Plus size={15} />
              New Tag
            </button>
          )}
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
              <Tag size={20} className="text-blue-500" />
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">No tags yet</p>
            <p className="text-xs text-gray-400">
              {search ? "No tags match your search" : "Create tags to organize your contacts"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <th className="text-left px-6 py-3 font-semibold">Tag</th>
                <th className="text-right px-4 py-3 font-semibold">Contacts</th>
                <th className="text-right px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((tag) => {
                const count = tagCount(tag);
                return (
                  <tr key={tag.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: tag.color ?? "#6366f1" }}
                        />
                        <span className="font-medium text-gray-800">{tag.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-gray-500">
                      {count} {count === 1 ? "contact" : "contacts"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {canWrite && (
                          <button
                            onClick={() => openEdit(tag)}
                            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Edit tag"
                          >
                            <Pencil size={14} />
                          </button>
                        )}
                        {canWrite && (
                          <button
                            onClick={() => deleteTag(tag)}
                            disabled={deleting === tag.id}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                            title="Delete tag"
                          >
                            {deleting === tag.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </button>
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
              {(meta.page - 1) * meta.pageSize + 1}–{Math.min(meta.page * meta.pageSize, meta.total)} of {meta.total}
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

      {/* Create/Edit drawer */}
      <FormDrawer
        open={drawerMode !== null}
        onClose={closeDrawer}
        title={drawerMode === "edit" ? "Edit Tag" : "Create Tag"}
        width="sm"
        submitLabel={drawerMode === "edit" ? "Save changes" : "Create tag"}
        submitting={submitting}
        submitDisabled={!formName.trim()}
        onSubmit={handleSubmit}
      >
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              autoFocus
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              placeholder="e.g. VIP Customer"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
            <ColorPicker value={formColor} onChange={setFormColor} />
          </div>
          {formError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {formError}
            </p>
          )}
        </div>
      </FormDrawer>
    </div>
  );
}
