"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  Plus, Pencil, Trash2, Loader2, LayoutTemplate, X, Save,
  FileText, TrendingUp, ShoppingCart, CheckCircle, ArrowUpCircle, ArrowDownCircle,
  Search, ChevronLeft, ChevronRight, Settings, Image as ImageIcon, Filter, Copy,
  Power, Download,
} from "lucide-react";
import { useConfirm } from "../ui/ConfirmDialog";
import { apiFetch, downloadFromApi } from "../../lib/api-client";
import { useRole } from "../../lib/role";

type StepType = "OPTIN" | "SALES" | "CHECKOUT" | "UPSELL" | "DOWNSELL" | "THANKYOU" | "CUSTOM";

type Template = {
  id: string;
  name: string;
  description: string | null;
  thumbnailUrl: string | null;
  type: StepType;
  tags: string[];
  isActive: boolean;
  createdAt: string;
};

// Curated tag taxonomy — operator picks from suggestions but free entry
// allowed for niche-specific tags. AI tool list_page_templates uses the
// same conventions for matching.
const TAG_SUGGESTIONS: { group: string; tags: string[] }[] = [
  {
    group: "Niche",
    tags: [
      "info-product", "ebook", "course", "saas", "coaching", "consulting",
      "ecommerce", "physical-product", "webinar", "agency", "b2b", "b2c",
    ],
  },
  {
    group: "Style",
    tags: ["minimal", "bold", "dense", "story-driven", "editorial", "modern", "classic"],
  },
  {
    group: "Mood",
    tags: ["urgent", "premium", "friendly", "professional", "edgy", "playful"],
  },
  {
    group: "Layout",
    tags: ["short-form", "medium", "long-form", "hero-only", "vsl", "comparison"],
  },
  {
    group: "Features",
    tags: [
      "countdown", "video", "testimonials", "faq", "pricing-table",
      "comparison-table", "bullet-benefits", "social-proof-numbers",
      "risk-reversal", "scarcity-banner", "objection-handling", "step-by-step",
    ],
  },
];

function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 40);
}

type StatusFilter = "all" | "active" | "disabled";

type PageMeta = { total: number; page: number; pageSize: number; totalPages: number };

const STEP_TYPES: { value: StepType; label: string; icon: React.ReactNode; color: string }[] = [
  { value: "OPTIN",    label: "Opt-in",    icon: <FileText size={12} />,       color: "text-violet-600 bg-violet-50" },
  { value: "SALES",    label: "Sales",     icon: <TrendingUp size={12} />,     color: "text-blue-600 bg-blue-50" },
  { value: "CHECKOUT", label: "Checkout",  icon: <ShoppingCart size={12} />,   color: "text-amber-600 bg-amber-50" },
  { value: "UPSELL",   label: "Upsell",    icon: <ArrowUpCircle size={12} />,  color: "text-green-600 bg-green-50" },
  { value: "DOWNSELL", label: "Downsell",  icon: <ArrowDownCircle size={12} />, color: "text-orange-600 bg-orange-50" },
  { value: "THANKYOU", label: "Thank You", icon: <CheckCircle size={12} />,    color: "text-teal-600 bg-teal-50" },
  { value: "CUSTOM",   label: "Custom page", icon: <FileText size={12} />,     color: "text-gray-700 bg-gray-100" },
];

function TypeBadge({ type }: { type: StepType }) {
  // Defensive fallback for any unknown/legacy type so the page never crashes.
  const t = STEP_TYPES.find((s) => s.value === type);
  if (!t) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-gray-500 bg-gray-100">
        {String(type)}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${t.color}`}>
      {t.icon} {t.label}
    </span>
  );
}

const THUMB_MAX_W = 800;
const THUMB_MAX_H = 450;
const THUMB_QUALITY = 0.85;

async function resizeImage(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const ratio = Math.min(THUMB_MAX_W / width, THUMB_MAX_H / height, 1);
      width  = Math.round(width  * ratio);
      height = Math.round(height * ratio);
      const canvas = document.createElement("canvas");
      canvas.width  = width;
      canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => resolve(blob ?? file), "image/jpeg", THUMB_QUALITY);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

async function deleteMedia(key: string) {
  await apiFetch("/api/media/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
  }).catch(() => {});
}

/* ─── Thumbnail Upload ─── */
function ThumbnailUpload({ url, onUpload, disabled }: { url: string | null; onUpload: (url: string | null) => void; disabled?: boolean }) {
  const [uploading, setUploading] = useState(false);
  const uploadedKey = useRef<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const blob = await resizeImage(file);
      const fd = new FormData();
      fd.append("file", new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
      const res = await apiFetch("/api/media/upload", { method: "POST", body: fd }).then((r) => r.json());
      const uploaded = res.data?.url ?? res.url;
      const key      = res.data?.key ?? null;
      if (uploaded) {
        if (uploadedKey.current) deleteMedia(uploadedKey.current);
        uploadedKey.current = key;
        onUpload(uploaded);
      }
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  function handleRemove() {
    if (uploadedKey.current) deleteMedia(uploadedKey.current);
    uploadedKey.current = null;
    onUpload(null);
  }

  return (
    <div className="relative group w-full aspect-video rounded-xl overflow-hidden border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center">
      {url ? (
        <>
          <img src={url} alt="" className="w-full h-full object-cover" />
          {!disabled && (
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <label className="cursor-pointer px-3 py-1.5 bg-white/90 rounded-lg text-xs font-medium text-gray-700 hover:bg-white">
                <input type="file" accept="image/*" className="sr-only" onChange={handleFile} />
                Change
              </label>
              <button type="button" onClick={handleRemove}
                className="px-3 py-1.5 bg-red-500/90 rounded-lg text-xs font-medium text-white hover:bg-red-600">
                Remove
              </button>
            </div>
          )}
        </>
      ) : disabled ? (
        <div className="flex flex-col items-center justify-center gap-2 w-full h-full py-6">
          <ImageIcon size={20} className="text-gray-300" />
          <span className="text-xs text-gray-400">No thumbnail</span>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center gap-2 cursor-pointer w-full h-full py-6">
          <input type="file" accept="image/*" className="sr-only" onChange={handleFile} />
          {uploading
            ? <Loader2 size={20} className="text-blue-400 animate-spin" />
            : <><ImageIcon size={20} className="text-gray-300" /><span className="text-xs text-gray-400">Upload thumbnail</span></>
          }
        </label>
      )}
    </div>
  );
}

/* ─── Settings Drawer ─── */
function TemplateSettingsPanel({ template, onClose, onSaved }: {
  template: Template; onClose: () => void; onSaved: (t: Template) => void;
}) {
  const { canManagePageTemplates, canUploadMedia } = useRole();
  const canUploadThumb = canManagePageTemplates && canUploadMedia;
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description ?? "");
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(template.thumbnailUrl);
  const [isActive, setIsActive] = useState(template.isActive);
  const [type, setType] = useState<StepType>(template.type);
  const [tags, setTags] = useState<string[]>(template.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addTag(raw: string) {
    const t = normalizeTag(raw);
    if (!t) return;
    setTags((prev) => (prev.includes(t) || prev.length >= 20 ? prev : [...prev, t]));
    setTagInput("");
  }

  function removeTag(t: string) {
    setTags((prev) => prev.filter((x) => x !== t));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    // Flush whatever's in the tag input before submit so users don't lose
    // a half-typed tag they forgot to enter.
    const finalTags = tagInput.trim()
      ? [...tags, normalizeTag(tagInput)].filter((t, i, a) => t && a.indexOf(t) === i)
      : tags;
    const res = await apiFetch(`/api/page-templates/${template.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description: description || null, thumbnailUrl, isActive, type, tags: finalTags }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { setError(json.error ?? "Failed to save"); return; }
    onSaved({ ...template, name, description: description || null, thumbnailUrl, isActive, type, tags: finalTags });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm bg-white h-full flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Template Settings</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && <div className="px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">{error}</div>}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Thumbnail</label>
            <ThumbnailUpload url={thumbnailUrl} onUpload={setThumbnailUrl} disabled={!canUploadThumb} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Name <span className="text-red-500">*</span></label>
            <input required value={name} onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              placeholder="Short description…"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Tags <span className="text-gray-400 font-normal">— help AI pick the right template</span>
            </label>
            <div className="flex flex-wrap gap-1.5 px-2 py-1.5 border border-gray-200 rounded-xl min-h-[40px] focus-within:ring-2 focus-within:ring-blue-500">
              {tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-blue-50 text-blue-700 rounded-md">
                  {t}
                  <button type="button" onClick={() => removeTag(t)} className="text-blue-500 hover:text-red-500">
                    <X size={11} />
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addTag(tagInput);
                  } else if (e.key === "Backspace" && !tagInput && tags.length) {
                    setTags((prev) => prev.slice(0, -1));
                  }
                }}
                onBlur={() => tagInput && addTag(tagInput)}
                placeholder={tags.length === 0 ? "saas, urgent, long-form…" : ""}
                className="flex-1 min-w-[100px] px-1 py-0.5 text-xs outline-none bg-transparent"
              />
            </div>
            <details className="mt-2">
              <summary className="text-xs text-blue-600 cursor-pointer hover:text-blue-700 select-none">
                Suggested tags
              </summary>
              <div className="mt-2 space-y-2">
                {TAG_SUGGESTIONS.map(({ group, tags: groupTags }) => (
                  <div key={group}>
                    <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">{group}</div>
                    <div className="flex flex-wrap gap-1">
                      {groupTags.filter((t) => !tags.includes(t)).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => addTag(t)}
                          className="text-[11px] px-2 py-0.5 border border-gray-200 rounded-md text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                        >
                          + {t}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Type</label>
            <div className="grid grid-cols-2 gap-2">
              {STEP_TYPES.map((s) => (
                <button key={s.value} type="button" disabled={!canManagePageTemplates} onClick={() => setType(s.value)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                    type === s.value ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                  }`}>
                  <span className={`${s.color} p-1 rounded-md`}>{s.icon}</span>
                  {s.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              Re-categorizes the template — controls which step type it shows up for.
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Status</label>
            <button
              type="button"
              onClick={() => setIsActive((v) => !v)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                isActive
                  ? "border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
                  : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100"
              }`}
            >
              <span className="flex items-center gap-2">
                <Power size={14} />
                {isActive ? "Active" : "Disabled"}
              </span>
              <span
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                  isActive ? "bg-green-500" : "bg-gray-300"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    isActive ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </span>
            </button>
            <p className="text-xs text-gray-400 mt-1.5">
              Disabled templates are hidden from the picker but stay in this list.
            </p>
          </div>
        </form>
        {canManagePageTemplates && (
          <div className="px-5 py-4 border-t border-gray-100">
            <button onClick={handleSave} disabled={saving || !name.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save changes
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Create Modal ─── */
function CreateTemplateModal({ onClose, onCreate }: { onClose: () => void; onCreate: (id: string) => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<StepType>("OPTIN");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true); setError(null);
    const res = await apiFetch("/api/page-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, type }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { setError(json.error ?? "Failed to create"); return; }
    onCreate(json.data.id);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-gray-900">New Template</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">{error}</div>}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Name <span className="text-red-500">*</span></label>
            <input ref={inputRef} required value={name} onChange={(e) => setName(e.target.value)}
              placeholder="My template"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Type</label>
            <div className="grid grid-cols-2 gap-2">
              {STEP_TYPES.map((s) => (
                <button key={s.value} type="button" onClick={() => setType(s.value)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-medium transition-colors ${
                    type === s.value ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                  }`}>
                  <span className={`${s.color} p-1 rounded-md`}>{s.icon}</span>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <button type="submit" disabled={saving || !name.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors mt-2">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Create & Design
          </button>
        </form>
      </div>
    </div>
  );
}

/* ─── Main Panel ─── */
export default function PageTemplatesPanel() {
  const { canManagePageTemplates } = useRole();
  const [items, setItems] = useState<Template[]>([]);
  const [meta, setMeta] = useState<PageMeta>({ total: 0, page: 1, pageSize: 25, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<StepType | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [cloning, setCloning] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [navigating, setNavigating] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [settingsFor, setSettingsFor] = useState<Template | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const params = useParams();
  const slug = params.workspaceSlug as string;
  const confirm = useConfirm();

  const fetchData = useCallback(async (q: string, p: number, t: StepType | "ALL", s: StatusFilter) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), pageSize: "25" });
    if (q) params.set("search", q);
    if (t !== "ALL") params.set("type", t);
    if (s !== "all") params.set("status", s);
    const res = await apiFetch(`/api/page-templates?${params}`);
    const json = await res.json();
    if (json.success) {
      setItems(json.data.items);
      setMeta({ total: json.data.total, page: json.data.page, pageSize: json.data.pageSize, totalPages: json.data.totalPages });
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(search, page, typeFilter, statusFilter); }, [fetchData, page, typeFilter, statusFilter]);

  function handleSearch(val: string) {
    setSearch(val);
    setPage(1);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchData(val, 1, typeFilter, statusFilter), 350);
  }

  function handleTypeFilter(val: StepType | "ALL") {
    setTypeFilter(val);
    setPage(1);
  }

  function handleStatusFilter(val: StatusFilter) {
    setStatusFilter(val);
    setPage(1);
  }

  async function handleClone(template: Template) {
    setCloning(template.id);
    const res = await apiFetch(`/api/page-templates/${template.id}/clone`, { method: "POST" });
    setCloning(null);
    if (res.ok) fetchData(search, page, typeFilter, statusFilter);
  }

  async function handleToggleActive(template: Template) {
    setToggling(template.id);
    const next = !template.isActive;
    const res = await apiFetch(`/api/page-templates/${template.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: next }),
    });
    setToggling(null);
    if (res.ok) {
      setItems((prev) => prev.map((t) => (t.id === template.id ? { ...t, isActive: next } : t)));
    }
  }

  async function handleDelete(template: Template) {
    const ok = await confirm({
      title: `Delete "${template.name}"?`,
      description: "This will permanently remove the template.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    setDeleting(template.id);
    await apiFetch(`/api/page-templates/${template.id}`, { method: "DELETE" });
    setDeleting(null);
    fetchData(search, page, typeFilter, statusFilter);
  }

  function handleCreated(id: string) {
    setShowCreate(false);
    setNavigating(id);
    router.push(`/${slug}/page-template-editor/${id}`);
  }

  function handleDesign(id: string) {
    setNavigating(id);
    router.push(`/${slug}/page-template-editor/${id}`);
  }

  function handleSaved(updated: Template) {
    setItems((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setSettingsFor(null);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 px-4 sm:px-6 py-4 shrink-0">
        <div className="shrink-0">
          <h1 className="text-xl font-bold text-gray-900">Page Templates</h1>
          <p className="text-sm text-gray-500 mt-0.5">{meta.total} template{meta.total !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 lg:flex-1 lg:justify-end">
          <div className="relative sm:flex-1 lg:max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search templates…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
          </div>
          <div className="relative shrink-0">
            <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <select
              value={typeFilter}
              onChange={(e) => handleTypeFilter(e.target.value as StepType | "ALL")}
              className="appearance-none w-full sm:w-auto pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-700 cursor-pointer"
            >
              <option value="ALL">All types</option>
              {STEP_TYPES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <ChevronRight size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 rotate-90 pointer-events-none" />
          </div>
          <div className="relative shrink-0">
            <Power size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <select
              value={statusFilter}
              onChange={(e) => handleStatusFilter(e.target.value as StatusFilter)}
              className="appearance-none w-full sm:w-auto pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-700 cursor-pointer"
            >
              <option value="all">All status</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
            <ChevronRight size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 rotate-90 pointer-events-none" />
          </div>
          {canManagePageTemplates && (
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors shrink-0">
              <Plus size={16} /> New Template
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
              <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
                <LayoutTemplate size={20} className="text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-700 mb-1">No templates yet</p>
              <p className="text-xs text-gray-400">
                {search || typeFilter !== "ALL" || statusFilter !== "all"
                  ? "No templates match your filters."
                  : "Create your first template to get started."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="text-left px-6 py-3 font-semibold">Name</th>
                    <th className="text-left px-4 py-3 font-semibold">Type</th>
                    <th className="text-left px-4 py-3 font-semibold">Status</th>
                    <th className="text-left px-4 py-3 font-semibold">Tags</th>
                    <th className="text-left px-4 py-3 font-semibold">Description</th>
                    <th className="text-left px-4 py-3 font-semibold">Created</th>
                    <th className="text-right px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {items.map((t) => (
                    <tr key={t.id} className={`hover:bg-gray-50 transition-colors group ${t.isActive ? "" : "opacity-60"}`}>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-7 rounded-md overflow-hidden border border-gray-100 bg-gray-50 shrink-0">
                            {t.thumbnailUrl
                              ? <img src={t.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                              : <div className="w-full h-full flex items-center justify-center"><LayoutTemplate size={12} className="text-gray-300" /></div>
                            }
                          </div>
                          <span className="font-medium text-gray-900 truncate">{t.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3"><TypeBadge type={t.type} /></td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          t.isActive ? "text-green-700 bg-green-50" : "text-gray-500 bg-gray-100"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${t.isActive ? "bg-green-500" : "bg-gray-400"}`} />
                          {t.isActive ? "Active" : "Disabled"}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-[220px]">
                        {t.tags && t.tags.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {t.tags.slice(0, 3).map((tag) => (
                              <span key={tag} className="inline-block px-1.5 py-0.5 text-[10px] bg-blue-50 text-blue-700 rounded">
                                {tag}
                              </span>
                            ))}
                            {t.tags.length > 3 && (
                              <span className="inline-block px-1.5 py-0.5 text-[10px] text-gray-400">
                                +{t.tags.length - 3}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs leading-relaxed align-top max-w-xs">
                        {t.description
                          ? <span className="line-clamp-2 break-words" title={t.description}>{t.description}</span>
                          : <span className="text-gray-300">—</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                        {new Date(t.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {canManagePageTemplates && (
                            <>
                              <button
                                onClick={() => handleDesign(t.id)}
                                disabled={navigating === t.id}
                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                                title="Design"
                              >
                                {navigating === t.id
                                  ? <Loader2 size={14} className="animate-spin text-blue-500" />
                                  : <Pencil size={14} />
                                }
                              </button>
                              <button
                                onClick={() => handleToggleActive(t)}
                                disabled={toggling === t.id}
                                className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                                  t.isActive
                                    ? "text-green-600 hover:text-gray-700 hover:bg-gray-100"
                                    : "text-gray-300 hover:text-green-600 hover:bg-green-50"
                                }`}
                                title={t.isActive ? "Disable" : "Activate"}
                              >
                                {toggling === t.id ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
                              </button>
                              <button
                                onClick={() => setSettingsFor(t)}
                                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                                title="Settings"
                              >
                                <Settings size={14} />
                              </button>
                              <button
                                onClick={() => handleClone(t)}
                                disabled={cloning === t.id}
                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                                title="Clone"
                              >
                                {cloning === t.id ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />}
                              </button>
                              <button
                                onClick={() => downloadFromApi(`/api/page-templates/${t.id}/export-bundle`, `${t.name}.ltbundle`).catch((e) => alert(e.message))}
                                title="Export as .ltbundle"
                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              >
                                <Download size={14} />
                              </button>
                              <button
                                onClick={() => handleDelete(t)}
                                disabled={deleting === t.id}
                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                                title="Delete"
                              >
                                {deleting === t.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
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
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={meta.page === 1}
                  className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-30 transition-colors">
                  <ChevronLeft size={16} />
                </button>
                <span className="px-2 text-xs text-gray-600">{meta.page} / {meta.totalPages}</span>
                <button onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))} disabled={meta.page === meta.totalPages}
                  className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-30 transition-colors">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showCreate && <CreateTemplateModal onClose={() => setShowCreate(false)} onCreate={handleCreated} />}
      {settingsFor && <TemplateSettingsPanel template={settingsFor} onClose={() => setSettingsFor(null)} onSaved={handleSaved} />}
    </div>
  );
}
