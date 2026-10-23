"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  Plus, Lock, Mail, Pencil, Copy, Trash2, Loader2, Search, Filter, ChevronRight,
} from "lucide-react";
import { EMPTY_EMAIL_DOC } from "@launchtic/email";
import { useConfirm } from "../ui/ConfirmDialog";
import { useRole } from "../../lib/role";
import { apiFetch } from "../../lib/api-client";
import ExportButton from "../ui/ExportButton";

type Category = "TRANSACTIONAL" | "MARKETING" | "SYSTEM";

type TemplateRow = {
  id: string;
  name: string;
  subject: string;
  category: Category;
  isSystem: boolean;
  systemKey: string | null;
  updatedAt: string;
};

const FILTERS: { id: "ALL" | Category; label: string }[] = [
  { id: "ALL", label: "All categories" },
  { id: "TRANSACTIONAL", label: "Transactional" },
  { id: "MARKETING", label: "Marketing" },
  { id: "SYSTEM", label: "System" },
];

const CATEGORY_BADGE: Record<Category, string> = {
  TRANSACTIONAL: "text-emerald-700 bg-emerald-50",
  MARKETING:     "text-blue-700 bg-blue-50",
  SYSTEM:        "text-purple-700 bg-purple-50",
};

export default function TemplatesList({ initial }: { initial: TemplateRow[] }) {
  const router = useRouter();
  const params = useParams();
  const slug = params.workspaceSlug as string;
  const confirm = useConfirm();
  const [items, setItems] = useState<TemplateRow[]>(initial);
  const [filter, setFilter] = useState<"ALL" | Category>("ALL");
  const [search, setSearch] = useState("");
  const [creating, startCreate] = useTransition();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const { canManageEmailTemplates, canDeleteEmailTemplates } = useRole();

  const filtered = useMemo(() => {
    let list = items;
    if (filter !== "ALL") list = list.filter((t) => t.category === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) => t.name.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q),
      );
    }
    return list;
  }, [items, filter, search]);

  function handleCreate() {
    startCreate(async () => {
      const res = await apiFetch("/api/email-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Untitled template",
          subject: "Subject line",
          htmlBody: EMPTY_EMAIL_DOC,
          category: "MARKETING",
        }),
      });
      const json = await res.json();
      if (json.success) router.push(`/${slug}/email-template-editor/${json.data.id}`);
    });
  }

  async function handleDuplicate(id: string) {
    setDuplicating(id);
    const res = await apiFetch(`/api/email-templates/${id}/duplicate`, { method: "POST" });
    const json = await res.json();
    setDuplicating(null);
    if (json.success) {
      setItems((prev) => [
        { ...json.data, updatedAt: json.data.updatedAt },
        ...prev,
      ]);
    }
  }

  async function handleDelete(t: TemplateRow) {
    const ok = await confirm({
      title: "Delete template?",
      description: `"${t.name}" will be permanently removed. This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;

    setDeleting(t.id);
    const res = await apiFetch(`/api/email-templates/${t.id}`, { method: "DELETE" });
    const json = await res.json();
    setDeleting(null);
    if (json.success) setItems((prev) => prev.filter((x) => x.id !== t.id));
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 px-4 sm:px-6 py-4 shrink-0">
        <div className="shrink-0">
          <h1 className="text-xl font-bold text-gray-900">Email Templates</h1>
          <p className="text-sm text-gray-500 mt-0.5">{items.length} template{items.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 lg:flex-1 lg:justify-end">
          <div className="relative sm:flex-1 lg:max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
          <div className="relative shrink-0">
            <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as "ALL" | Category)}
              className="appearance-none w-full sm:w-auto pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-700 cursor-pointer"
            >
              {FILTERS.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
            <ChevronRight size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 rotate-90 pointer-events-none" />
          </div>
          {canManageEmailTemplates && (
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors shrink-0"
            >
              {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} New Template
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-4 sm:px-6 pb-4">
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
                <Mail size={20} className="text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-700 mb-1">No templates yet</p>
              <p className="text-xs text-gray-400">
                {items.length === 0 ? "Create your first template to get started." : "No templates match your filters."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="text-left px-6 py-3 font-semibold">Name</th>
                    <th className="text-left px-4 py-3 font-semibold">Category</th>
                    <th className="text-left px-4 py-3 font-semibold">Updated</th>
                    <th className="text-right px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((t) => (
                    <tr key={t.id} className="hover:bg-gray-50 transition-colors group">
                      <td className="px-6 py-3">
                        <Link href={`/${slug}/email-template-editor/${t.id}`} className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-7 rounded-md border border-gray-100 bg-gray-50 shrink-0 flex items-center justify-center">
                            {t.isSystem ? <Lock size={12} className="text-gray-400" /> : <Mail size={12} className="text-gray-300" />}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 truncate">{t.name}</p>
                            <p className="text-xs text-gray-500 truncate">{t.subject}</p>
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_BADGE[t.category]}`}>
                          {FILTERS.find((f) => f.id === t.category)?.label ?? t.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                        {new Date(t.updatedAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={`/${slug}/email-template-editor/${t.id}`}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Design"
                          >
                            <Pencil size={14} />
                          </Link>
                          {canManageEmailTemplates && (
                            <button
                              onClick={() => handleDuplicate(t.id)}
                              disabled={duplicating === t.id}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                              title="Clone"
                            >
                              {duplicating === t.id ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />}
                            </button>
                          )}
                          <ExportButton url={`/api/email-templates/${t.id}/export-bundle`} filename={`${t.name}.ltbundle`} />
                          {canDeleteEmailTemplates && !t.isSystem && (
                            <button
                              onClick={() => handleDelete(t)}
                              disabled={deleting === t.id}
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                              title="Delete"
                            >
                              {deleting === t.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
