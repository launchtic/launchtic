"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  Plus, Lock, Mail, Pencil, Copy, Trash2, Loader2, Search,
} from "lucide-react";
import { EMPTY_EMAIL_DOC } from "@launchtic/email";
import { useConfirm } from "../ui/ConfirmDialog";
import { useRole } from "../../lib/role";
import { apiFetch } from "../../lib/api-client";

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
  { id: "ALL", label: "All" },
  { id: "TRANSACTIONAL", label: "Transactional" },
  { id: "MARKETING", label: "Marketing" },
  { id: "SYSTEM", label: "System" },
];

const CATEGORY_BADGE: Record<Category, string> = {
  TRANSACTIONAL: "bg-emerald-50 text-emerald-700 border-emerald-200",
  MARKETING:     "bg-blue-50 text-blue-700 border-blue-200",
  SYSTEM:        "bg-purple-50 text-purple-700 border-purple-200",
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
  const { canWrite } = useRole();

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
      if (json.success) router.push(`/${slug}/emails/templates/${json.data.id}`);
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
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Mail size={20} className="text-gray-700" /> Email Templates
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Reusable email content for broadcasts, automations, and transactional sends.
          </p>
        </div>
        {canWrite && (
          <button
            onClick={handleCreate}
            disabled={creating}
            className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl transition-colors shrink-0"
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            New template
          </button>
        )}
      </div>

      {/* Filters + Search */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as "ALL" | Category)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 sm:w-44"
        >
          {FILTERS.map((f) => (
            <option key={f.id} value={f.id}>{f.label}</option>
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
          <Mail size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">
            {items.length === 0 ? "No templates yet. Create your first one." : "No templates match your filters."}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          {filtered.map((t) => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors">
              <Link href={`/${slug}/emails/templates/${t.id}`} className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  {t.isSystem && <Lock size={13} className="text-gray-400 shrink-0" />}
                  <span className="text-sm font-medium text-gray-900 truncate">{t.name}</span>
                  <span className={`text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded border ${CATEGORY_BADGE[t.category]} shrink-0`}>
                    {t.category.toLowerCase()}
                  </span>
                </div>
                <p className="text-xs text-gray-500 truncate">{t.subject}</p>
              </Link>
              <span className="text-xs text-gray-400 hidden sm:block">
                {new Date(t.updatedAt).toLocaleDateString()}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <Link
                  href={`/${slug}/emails/templates/${t.id}`}
                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="Edit"
                >
                  <Pencil size={14} />
                </Link>
                {canWrite && (
                  <button
                    onClick={() => handleDuplicate(t.id)}
                    disabled={duplicating === t.id}
                    className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                    title="Duplicate"
                  >
                    {duplicating === t.id ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />}
                  </button>
                )}
                {canWrite && !t.isSystem && (
                  <button
                    onClick={() => handleDelete(t)}
                    disabled={deleting === t.id}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                    title="Delete"
                  >
                    {deleting === t.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
