"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Loader2, LayoutTemplate, CheckCircle, Search,
  FileText, ShoppingCart, ArrowUpCircle, ArrowDownCircle, FilePlus,
} from "lucide-react";
import { apiFetch } from "../../lib/api-client";

const PAGE_SIZE = 24;

type StepType = "LANDING" | "CHECKOUT" | "UPSELL" | "DOWNSELL" | "THANKYOU" | "CUSTOM";

type Template = {
  id: string;
  name: string;
  description: string | null;
  thumbnailUrl: string | null;
  type: StepType;
  slotCount: number;
};

const TYPE_LABEL: Record<StepType, string> = {
  LANDING: "Landing page", CHECKOUT: "Checkout", UPSELL: "Upsell",
  DOWNSELL: "Downsell", THANKYOU: "Thank You", CUSTOM: "Custom page",
};
const TYPE_ICON: Record<StepType, React.ReactNode> = {
  LANDING: <FileText size={13} />, CHECKOUT: <ShoppingCart size={13} />,
  UPSELL: <ArrowUpCircle size={13} />, DOWNSELL: <ArrowDownCircle size={13} />,
  THANKYOU: <CheckCircle size={13} />, CUSTOM: <FileText size={13} />,
};
const TYPE_COLOR: Record<StepType, string> = {
  LANDING: "text-violet-600 bg-violet-50",
  CHECKOUT: "text-amber-600 bg-amber-50", UPSELL: "text-green-600 bg-green-50",
  DOWNSELL: "text-orange-600 bg-orange-50", THANKYOU: "text-teal-600 bg-teal-50",
  CUSTOM: "text-gray-700 bg-gray-100",
};

// Inline template picker for a funnel step. Applies the chosen template's
// pageJson to the step via /apply-template. Replacing existing content is
// confirmed by the CALLER before this is shown (so apply here is direct).
export default function TemplateGallery({
  stepId,
  stepType,
  title = "Choose a template",
  subtitle,
  onApplied,
  onBlank,
}: {
  stepId: string;
  stepType: StepType;
  title?: string;
  subtitle?: string;
  onApplied: () => void;
  /** Optional "Start from blank" escape hatch (e.g. open the editor). */
  onBlank?: () => void;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<Template | null>(null);
  const [applying, setApplying] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchTemplates = useCallback(
    async (q: string, p: number, append: boolean) => {
      if (append) setLoadingMore(true); else setLoading(true);
      const params = new URLSearchParams({ status: "active", type: stepType, page: String(p), pageSize: String(PAGE_SIZE) });
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

  useEffect(() => { setPage(1); fetchTemplates("", 1, false); }, [stepType, fetchTemplates]);

  function handleSearch(val: string) {
    setSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setPage(1); fetchTemplates(val, 1, false); }, 350);
  }
  function handleLoadMore() {
    const next = page + 1;
    setPage(next);
    fetchTemplates(search, next, true);
  }

  async function handleApply() {
    if (!selected) return;
    setApplying(true);
    await apiFetch(`/api/funnel-steps/${stepId}/apply-template`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId: selected.id }),
    });
    setApplying(false);
    onApplied();
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header + search */}
      <div className="shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
            {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          {onBlank && (
            <button
              onClick={onBlank}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors shrink-0"
            >
              <FilePlus size={13} /> Start from blank
            </button>
          )}
        </div>
        <div className="relative mt-3">
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
      <div className="flex-1 overflow-y-auto py-4">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 size={20} className="animate-spin text-gray-300" /></div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <LayoutTemplate size={28} className="text-gray-200 mb-3" />
            {search ? (
              <p className="text-sm text-gray-400">No matches for &ldquo;{search}&rdquo;</p>
            ) : (
              <>
                <p className="text-sm text-gray-400">No {TYPE_LABEL[stepType]} templates found</p>
                <p className="text-xs text-gray-300 mt-1">Create templates in Settings → Content → Page Templates</p>
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
                  selected?.id === t.id ? "border-blue-500 shadow-md shadow-blue-100" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="relative w-full aspect-video bg-gray-50 overflow-hidden">
                  {t.thumbnailUrl ? (
                    <img src={t.thumbnailUrl} alt={t.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><LayoutTemplate size={24} className="text-gray-200" /></div>
                  )}
                  {selected?.id === t.id && (
                    <div className="absolute top-2 right-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                      <CheckCircle size={12} className="text-white" />
                    </div>
                  )}
                </div>
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

      {/* Apply bar */}
      <div className="px-1 py-3 border-t border-gray-100 flex items-center justify-between shrink-0">
        <p className="text-xs text-gray-400">{selected ? `Selected: ${selected.name}` : "Pick a template to apply"}</p>
        <button
          disabled={!selected || applying}
          onClick={handleApply}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {applying && <Loader2 size={13} className="animate-spin" />}
          Apply template
        </button>
      </div>
    </div>
  );
}
