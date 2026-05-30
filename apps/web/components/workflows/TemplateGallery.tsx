"use client";

// Template picker modal — shown when operator clicks "Browse templates" on
// the workflows list. Cloning posts to /api/workflows/from-template and then
// router.push()es into the editor where the operator customizes.

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  X, Search, ShoppingCart, Mail, PackageCheck, Crown, Undo2, AlertTriangle,
  Heart, Split, MousePointerClick, Gift, Loader2, Sparkles,
} from "lucide-react";
import { useToast } from "../ui/Toast";
import { apiFetch } from "../../lib/api-client";
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from "../../lib/workflow-templates";

const ICONS: Record<string, typeof Sparkles> = {
  ShoppingCart, Mail, PackageCheck, Crown, Undo2, AlertTriangle,
  Heart, Split, MousePointerClick, Gift,
};

const CATEGORY_COLORS: Record<WorkflowTemplate["category"], string> = {
  Sales:           "bg-emerald-50 text-emerald-700",
  Onboarding:      "bg-blue-50 text-blue-700",
  "Re-engagement": "bg-purple-50 text-purple-700",
  Retention:       "bg-amber-50 text-amber-700",
  Tagging:         "bg-pink-50 text-pink-700",
};

const BADGE_COLORS: Record<NonNullable<WorkflowTemplate["badge"]>, string> = {
  Flagship: "bg-gradient-to-r from-amber-500 to-orange-500 text-white",
  Popular:  "bg-emerald-500 text-white",
  New:      "bg-blue-500 text-white",
};

const CATEGORIES = ["All", "Sales", "Onboarding", "Re-engagement", "Retention", "Tagging"] as const;

export default function TemplateGallery({ onClose }: { onClose: () => void }) {
  const router  = useRouter();
  const params  = useParams();
  const slug    = params.workspaceSlug as string;
  const toast   = useToast();
  const [search, setSearch]     = useState("");
  const [category, setCategory] = useState<typeof CATEGORIES[number]>("All");
  const [busyId, setBusyId]     = useState<string | null>(null);

  const filtered = useMemo(() => {
    return WORKFLOW_TEMPLATES.filter((t) => {
      if (category !== "All" && t.category !== category) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
      }
      return true;
    });
  }, [search, category]);

  async function useTemplate(t: WorkflowTemplate) {
    setBusyId(t.id);
    const res = await apiFetch("/api/workflows/from-template", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ templateId: t.id }),
    });
    const json = await res.json();
    setBusyId(null);
    if (!json.success) { toast.error(json.error ?? "Failed to create workflow"); return; }
    router.push(`/${slug}/workflows/${json.data.id}`);
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-amber-500" />
              <h2 className="text-base font-semibold text-gray-900">Workflow templates</h2>
              <span className="text-xs text-gray-400">{WORKFLOW_TEMPLATES.length} ready to clone</span>
            </div>
            <button onClick={onClose} className="p-1 text-gray-400 hover:bg-gray-100 rounded"><X size={16} /></button>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search templates…"
                className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as typeof CATEGORIES[number])}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">No templates match your filters.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filtered.map((t) => {
                const Icon = ICONS[t.icon] ?? Sparkles;
                const nodeCount = t.nodes.length;
                return (
                  <div key={t.id} className="bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-200 hover:shadow-sm transition-all">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${CATEGORY_COLORS[t.category]}`}>
                        <Icon size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="text-sm font-semibold text-gray-900">{t.name}</h3>
                          {t.badge && (
                            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${BADGE_COLORS[t.badge]}`}>
                              {t.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mb-2 leading-relaxed">{t.description}</p>
                        <div className="flex items-center gap-2 text-[10px] text-gray-400 uppercase tracking-wider">
                          <span className={`px-1.5 py-0.5 rounded ${CATEGORY_COLORS[t.category]}`}>{t.category}</span>
                          <span>·</span>
                          <span>{t.triggerType.replace(/_/g, " ").toLowerCase()}</span>
                          <span>·</span>
                          <span>{nodeCount} node{nodeCount !== 1 ? "s" : ""}</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => useTemplate(t)}
                      disabled={busyId === t.id}
                      className="mt-3 w-full px-3 py-1.5 text-xs font-medium text-white bg-gray-900 hover:bg-black rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
                    >
                      {busyId === t.id ? <Loader2 size={12} className="animate-spin" /> : null}
                      Use this template
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
