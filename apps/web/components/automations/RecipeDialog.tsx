"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { X, Loader2, Plus, Sparkles, ArrowRight } from "lucide-react";
import { RECIPES, BLANK_TEMPLATE, type Recipe } from "./recipes";
import { useToast } from "../ui/Toast";

export default function RecipeDialog({
  open, onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const params = useParams();
  const slug = params.workspaceSlug as string;
  const toast = useToast();
  const [creating, setCreating] = useState<string | null>(null);

  if (!open) return null;

  async function pickRecipe(template: Recipe["template"], recipeId: string) {
    setCreating(recipeId);
    const res = await fetch("/api/automations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(template),
    });
    const json = await res.json();
    setCreating(null);
    if (json.success) {
      onClose();
      router.push(`/${slug}/automations/${json.data.id}`);
    } else {
      toast.error(json.error ?? "Failed to create automation");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 backdrop-blur-[2px] overflow-y-auto p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-4 sm:my-8 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 sm:px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5 min-w-0">
            <Sparkles size={18} className="text-blue-600 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-gray-900">Start with a recipe</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Pre-built automations for common cases. You can customize after.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 -mr-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Recipe grid */}
        <div className="p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {RECIPES.map((r) => (
            <button
              key={r.id}
              onClick={() => pickRecipe(r.template, r.id)}
              disabled={creating !== null}
              className="group relative text-left p-4 border border-gray-200 hover:border-blue-300 hover:bg-blue-50/30 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {r.badge && (
                <span className="absolute top-2 right-2 text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                  {r.badge}
                </span>
              )}
              <div className="flex items-start gap-2.5">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${r.iconColor}`}>
                  <r.icon size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 group-hover:text-blue-700 transition-colors">
                    {r.name}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                    {r.description}
                  </p>
                  <div className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-400">
                    <span>{summaryFor(r.template.triggerType)}</span>
                    <ArrowRight size={10} />
                    <span>{r.template.actions.length} action{r.template.actions.length !== 1 ? "s" : ""}</span>
                  </div>
                </div>
                {creating === r.id && (
                  <Loader2 size={14} className="animate-spin text-blue-500 shrink-0" />
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Build from scratch */}
        <div className="border-t border-gray-100 px-5 sm:px-6 py-4 bg-gray-50/50">
          <button
            onClick={() => pickRecipe(BLANK_TEMPLATE, "blank")}
            disabled={creating !== null}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:border-gray-300 hover:bg-white rounded-xl transition-colors disabled:opacity-50"
          >
            {creating === "blank" ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Build from scratch
          </button>
        </div>
      </div>
    </div>
  );
}

function summaryFor(triggerType: string): string {
  switch (triggerType) {
    case "NEW_SALE":           return "On purchase";
    case "FORM_SUBMIT":        return "On form submit";
    case "TAG_ADDED":          return "On tag added";
    case "TAG_REMOVED":        return "On tag removed";
    case "EMAIL_LINK_CLICKED": return "On email click";
    default:                   return triggerType;
  }
}
