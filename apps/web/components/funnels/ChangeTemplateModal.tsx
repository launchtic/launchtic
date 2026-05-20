"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  X, Loader2, LayoutTemplate, CheckCircle, Sparkles, Search,
  FileText, TrendingUp, ShoppingCart, ArrowUpCircle, ArrowDownCircle,
} from "lucide-react";
import { apiFetch } from "../../lib/api-client";

const PAGE_SIZE = 24; // 3 cols × 8 rows — fits the modal viewport without crowding.

type StepType = "OPTIN" | "SALES" | "CHECKOUT" | "UPSELL" | "DOWNSELL" | "THANKYOU" | "CUSTOM";

type Template = {
  id: string;
  name: string;
  description: string | null;
  thumbnailUrl: string | null;
  type: StepType;
  slotCount: number;
};

const TYPE_LABEL: Record<StepType, string> = {
  OPTIN:    "Opt-in",
  SALES:    "Sales",
  CHECKOUT: "Checkout",
  UPSELL:   "Upsell",
  DOWNSELL: "Downsell",
  THANKYOU: "Thank You",
  CUSTOM:   "Custom page",
};

const TYPE_ICON: Record<StepType, React.ReactNode> = {
  OPTIN:    <FileText size={13} />,
  SALES:    <TrendingUp size={13} />,
  CHECKOUT: <ShoppingCart size={13} />,
  UPSELL:   <ArrowUpCircle size={13} />,
  DOWNSELL: <ArrowDownCircle size={13} />,
  THANKYOU: <CheckCircle size={13} />,
  CUSTOM:   <FileText size={13} />,
};

const TYPE_COLOR: Record<StepType, string> = {
  OPTIN:    "text-violet-600 bg-violet-50",
  SALES:    "text-blue-600 bg-blue-50",
  CHECKOUT: "text-amber-600 bg-amber-50",
  UPSELL:   "text-green-600 bg-green-50",
  DOWNSELL: "text-orange-600 bg-orange-50",
  THANKYOU: "text-teal-600 bg-teal-50",
  CUSTOM:   "text-gray-700 bg-gray-100",
};

export default function ChangeTemplateModal({
  stepId,
  stepType,
  funnelName,
  onClose,
  onApplied,
}: {
  stepId: string;
  stepType: StepType;
  funnelName?: string;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<Template | null>(null);
  const [applying, setApplying] = useState(false);
  const [confirmStep, setConfirmStep] = useState(false);
  // AI fill: only relevant when the picked template has slots. Default ON
  // because skipping it would leave literal {{slot}} placeholders on the page.
  const [aiFill, setAiFill] = useState(true);
  const [brief, setBrief] = useState(funnelName?.trim() ?? "");

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Only fetch templates matching the current step type — replacing a CHECKOUT
  // page with an OPTIN template would break the funnel (price plans, payment
  // config tied to step type, not pageJson).
  const fetchTemplates = useCallback(
    async (q: string, p: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);

      const params = new URLSearchParams({
        status: "active",
        type: stepType,
        page: String(p),
        pageSize: String(PAGE_SIZE),
      });
      if (q) params.set("search", q);

      try {
        const res = await apiFetch(`/api/page-templates?${params}`).then((r) => r.json());
        const items: Template[] = res.data?.items ?? [];
        const totalPages: number = res.data?.totalPages ?? 1;
        setTemplates((prev) => (append ? [...prev, ...items] : items));
        setHasMore(p < totalPages);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [stepType],
  );

  useEffect(() => {
    setPage(1);
    fetchTemplates("", 1, false);
  }, [stepType, fetchTemplates]);

  function handleSearch(val: string) {
    setSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      fetchTemplates(val, 1, false);
    }, 350);
  }

  function handleLoadMore() {
    const next = page + 1;
    setPage(next);
    fetchTemplates(search, next, true);
  }

  const showAiPanel = !!selected && selected.slotCount > 0;
  const wantsAiFill = showAiPanel && aiFill && brief.trim().length > 0;

  async function handleApply() {
    if (!selected) return;
    setApplying(true);

    await apiFetch(`/api/funnel-steps/${stepId}/apply-template`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId: selected.id,
        brief: wantsAiFill ? brief.trim() : undefined,
      }),
    });

    setApplying(false);
    onApplied();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative z-10 w-full max-w-3xl max-h-[85vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Change Template</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder={`Search ${TYPE_LABEL[stepType]} templates…`}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={20} className="animate-spin text-gray-300" />
            </div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <LayoutTemplate size={28} className="text-gray-200 mb-3" />
              {search ? (
                <>
                  <p className="text-sm text-gray-400">No matches for &ldquo;{search}&rdquo;</p>
                  <p className="text-xs text-gray-300 mt-1">Try a different search term.</p>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-400">No {TYPE_LABEL[stepType]} templates found</p>
                  <p className="text-xs text-gray-300 mt-1">Create templates in Settings → Funnel Templates</p>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelected(selected?.id === t.id ? null : t)}
                  className={`group text-left rounded-xl border-2 overflow-hidden transition-all ${
                    selected?.id === t.id
                      ? "border-blue-500 shadow-md shadow-blue-100"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  {/* Thumbnail */}
                  <div className="relative w-full aspect-video bg-gray-50 overflow-hidden">
                    {t.thumbnailUrl ? (
                      <img src={t.thumbnailUrl} alt={t.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <LayoutTemplate size={24} className="text-gray-200" />
                      </div>
                    )}
                    {selected?.id === t.id && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                        <CheckCircle size={12} className="text-white" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    <p className="text-xs font-medium text-gray-900 truncate">{t.name}</p>
                    <span className={`inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${TYPE_COLOR[t.type]}`}>
                      {TYPE_ICON[t.type]} {TYPE_LABEL[t.type]}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {hasMore && !loading && (
            <div className="flex justify-center mt-6">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {loadingMore && <Loader2 size={13} className="animate-spin" />}
                Load more
              </button>
            </div>
          )}
        </div>

        {/* AI fill panel — only when picked template has slots */}
        {showAiPanel && (
          <div className="px-6 py-3 border-t border-gray-100 bg-gradient-to-b from-violet-50/40 to-white shrink-0">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={aiFill}
                onChange={(e) => setAiFill(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-gray-300 text-violet-600 focus:ring-violet-500 focus:ring-offset-0"
              />
              <Sparkles size={13} className="text-violet-500" />
              <span className="text-xs font-medium text-gray-700">
                Auto-fill {selected!.slotCount} slot{selected!.slotCount === 1 ? "" : "s"} with AI
              </span>
            </label>
            {aiFill && (
              <div className="mt-2 ml-6">
                <textarea
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  placeholder="Tell AI about your offer (audience, key benefits, tone)…"
                  rows={2}
                  className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white resize-none"
                />
                {brief.trim().length === 0 && (
                  <p className="text-[11px] text-gray-400 mt-1">Required to fill slots — leave blank to paste raw template.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between shrink-0">
          <p className="text-xs text-gray-400">
            {selected ? `Selected: ${selected.name}` : "No template selected"}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>

            {!confirmStep ? (
              <button
                disabled={!selected}
                onClick={() => setConfirmStep(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {wantsAiFill && <Sparkles size={13} />}
                {wantsAiFill ? "Apply with AI" : "Apply Template"}
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-amber-600 font-medium">
                  {wantsAiFill
                    ? "Replace content + AI fill (~10-20s)."
                    : "This will replace your current page content."}
                </span>
                <button
                  onClick={() => setConfirmStep(false)}
                  className="px-3 py-2 text-xs text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleApply}
                  disabled={applying}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-60 transition-colors"
                >
                  {applying && <Loader2 size={13} className="animate-spin" />}
                  Confirm Replace
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
