"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  ChevronRight,
  ChevronLeft,
  Eye,
  Pencil,
  Trash2,
  Loader2,
  FileText,
  TrendingUp,
  ShoppingCart,
  ArrowUpCircle,
  ArrowDownCircle,
  CheckCircle,
  Settings,
  RefreshCw,
  Save,
  AlertCircle,
  Plus,
} from "lucide-react";
import { useConfirm } from "../ui/ConfirmDialog";
import AddStepDialog from "./AddStepDialog";
import ProductsTab from "./ProductsTab";
import FunnelAnalyticsView from "./FunnelAnalyticsView";
import AbTestPanel from "./AbTestPanel";
import FunnelFormDrawer from "./FunnelFormDrawer";
import ChangeTemplateModal from "./ChangeTemplateModal";
import { apiFetch } from "../../lib/api-client";
import { useRole } from "../../lib/role";

type Step = {
  id: string;
  name: string;
  slug: string;
  type: string;
  order: number;
};

type Funnel = {
  id: string;
  name: string;
  primaryDomain: string | null;
};

function stepViewUrl(rendererUrl: string, primaryDomain: string | null, slug: string) {
  return `${stepUrlPrefix(rendererUrl, primaryDomain)}/${slug}`;
}

/** Just the origin (no trailing slash) used in URL preview. When the funnel
 *  has a custom domain assigned, use it; otherwise fall back to the workspace's
 *  default pages renderer. Both the clickable "View" link and the configure-tab
 *  prefix must agree — otherwise the operator sees `default/slug` in the form
 *  but the View button opens `custom/slug` (or vice-versa). */
function stepUrlPrefix(rendererUrl: string, primaryDomain: string | null) {
  if (primaryDomain) {
    const { port, protocol } = new URL(rendererUrl);
    const portSuffix = port ? `:${port}` : "";
    return `${protocol}//${primaryDomain}${portSuffix}`;
  }
  return rendererUrl;
}

const TYPE_ICON_MAP: Record<string, React.ReactNode> = {
  OPTIN:    <FileText size={15} />,
  SALES:    <TrendingUp size={15} />,
  CHECKOUT: <ShoppingCart size={15} />,
  UPSELL:   <ArrowUpCircle size={15} />,
  DOWNSELL: <ArrowDownCircle size={15} />,
  THANKYOU: <CheckCircle size={15} />,
  CUSTOM:   <FileText size={15} />,
};

const TYPE_LABEL_MAP: Record<string, string> = {
  OPTIN:    "Opt-in page",
  SALES:    "Sales page",
  CHECKOUT: "Checkout page",
  UPSELL:   "Upsell page",
  DOWNSELL: "Downsell page",
  THANKYOU: "Thank you page",
  CUSTOM:   "Custom page",
};

const TYPE_COLOR_MAP: Record<string, string> = {
  OPTIN:    "text-violet-600 bg-violet-50",
  SALES:    "text-blue-600 bg-blue-50",
  CHECKOUT: "text-amber-600 bg-amber-50",
  UPSELL:   "text-green-600 bg-green-50",
  DOWNSELL: "text-orange-600 bg-orange-50",
  THANKYOU: "text-teal-600 bg-teal-50",
  CUSTOM:   "text-gray-700 bg-gray-100",
};

const ALL_TABS = [
  { id: "configuration", label: "Configuration", types: null },
  { id: "products",      label: "Products",      types: ["CHECKOUT"] },
  { id: "ab",            label: "A/B Test",      types: null },
  { id: "analytics",     label: "Analytics",     types: null },
] as const;

/* ─── Sortable step row ─── */
function SortableStepItem({
  step,
  isSelected,
  deleting,
  canManage,
  canDelete,
  onSelect,
  onDelete,
}: {
  step: Step;
  isSelected: boolean;
  deleting: boolean;
  canManage: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: step.id, disabled: !canManage });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const iconColor = TYPE_COLOR_MAP[step.type] ?? "text-gray-500 bg-gray-100";

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={`group/item relative flex items-center gap-2.5 px-3 py-3 cursor-pointer border-b border-gray-100 transition-colors select-none ${
        isSelected
          ? "bg-blue-50 border-l-[3px] border-l-blue-500"
          : "hover:bg-gray-50 border-l-[3px] border-l-transparent"
      }`}
    >
      {/* Drag handle */}
      {canManage ? (
        <button
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="text-gray-300 hover:text-gray-400 cursor-grab active:cursor-grabbing touch-none shrink-0"
        >
          <GripVertical size={13} />
        </button>
      ) : (
        <span className="w-[13px] shrink-0" />
      )}

      {/* Type icon */}
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconColor}`}>
        {TYPE_ICON_MAP[step.type] ?? <FileText size={15} />}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 pr-8">
        <p className={`text-sm font-medium truncate leading-tight ${isSelected ? "text-blue-700" : "text-gray-800"}`}>
          {step.name}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          {TYPE_LABEL_MAP[step.type] ?? step.type}
        </p>
      </div>

      {/* Delete — hover on desktop, always visible on mobile */}
      {canDelete && (
        <button
          onClick={onDelete}
          disabled={deleting}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-all disabled:opacity-40 sm:opacity-0 sm:group-hover/item:opacity-100"
          title="Delete step"
        >
          {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
        </button>
      )}

      {/* Arrow hint for mobile */}
      <ChevronRight size={14} className="text-gray-300 shrink-0 sm:hidden" />
    </div>
  );
}

/* ─── Configuration tab ─── */
function ConfigurationTab({ step, rendererUrl, primaryDomain, onUpdate }: { step: Step; funnelId: string; rendererUrl: string; primaryDomain: string | null; onUpdate: (updated: Step) => void }) {
  const urlPrefix = stepUrlPrefix(rendererUrl, primaryDomain);
  const { canManageFunnels } = useRole();
  const [name, setName] = useState(step.name);
  const [slug, setSlug] = useState(step.slug);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(step.name);
    setSlug(step.slug);
    setSaved(false);
    setError(null);
  }, [step.id]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const res = await apiFetch(`/api/funnel-steps/${step.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, slug }),
    });
    const json = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(json.error ?? "Failed to save");
      return;
    }

    setSaved(true);
    onUpdate({ ...step, name, slug });
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <form onSubmit={handleSave} className="max-w-2xl">
      {error && (
        <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 mb-4">
        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!canManageFunnels}
            className={`w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${!canManageFunnels ? "bg-gray-50 cursor-not-allowed text-gray-500" : ""}`}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">URL Path</label>
          {/* Mobile: stacked prefix + input */}
          <div className="hidden sm:flex">
            <span className="flex items-center px-3 py-2 text-sm bg-gray-50 border border-r-0 border-gray-300 rounded-l-lg text-gray-500 whitespace-nowrap">
              {urlPrefix}/
            </span>
            <input
              type="text"
              value={slug}
              placeholder="(root)"
              onChange={(e) => setSlug(e.target.value)}
              disabled={!canManageFunnels}
              className={`flex-1 px-3 py-2 text-sm border border-gray-300 rounded-r-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono ${!canManageFunnels ? "bg-gray-50 cursor-not-allowed text-gray-500" : ""}`}
            />
          </div>
          <div className="sm:hidden">
            <p className="text-xs text-gray-400 mb-1 font-mono truncate">{urlPrefix}/</p>
            <input
              type="text"
              value={slug}
              placeholder="(root)"
              onChange={(e) => setSlug(e.target.value)}
              disabled={!canManageFunnels}
              className={`w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono ${!canManageFunnels ? "bg-gray-50 cursor-not-allowed text-gray-500" : ""}`}
            />
          </div>
        </div>
      </div>

      {canManageFunnels && (
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saved ? "Saved!" : saving ? "Saving…" : "Save changes"}
        </button>
      )}
    </form>
  );
}

/* ─── Placeholder tabs ─── */
function PlaceholderTab({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
        <Settings size={20} className="text-gray-400" />
      </div>
      <p className="text-sm font-semibold text-gray-700">{label}</p>
      <p className="text-xs text-gray-400 mt-1">This feature is coming soon.</p>
    </div>
  );
}

/* ─── Main component ─── */
export default function FunnelStepManager({
  funnel,
  initialSteps,
  rendererUrl,
  canViewAnalytics = false,
  canAbTest = false,
}: {
  funnel: Funnel;
  initialSteps: Step[];
  rendererUrl: string;
  // funnelAnalytics plan feature (Starter+) — gates the Analytics tab content.
  canViewAnalytics?: boolean;
  // abTesting plan feature (Starter+) — gates the A/B Test tab content.
  canAbTest?: boolean;
}) {
  const { canManageFunnels, canDeleteFunnels } = useRole();
  const [steps, setSteps] = useState(initialSteps);
  const [selectedId, setSelectedId] = useState<string | null>(initialSteps[0]?.id ?? null);
  const [activeTab, setActiveTab] = useState("configuration");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [changeTemplateOpen, setChangeTemplateOpen] = useState(false);
  // mobile: 'list' shows sidebar, 'detail' shows right panel
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");
  const router = useRouter();
  const params = useParams();
  const slug = params.workspaceSlug as string;
  const confirm = useConfirm();

  useEffect(() => {
    setSteps(initialSteps);
    if (!initialSteps.find((s) => s.id === selectedId)) {
      setSelectedId(initialSteps[0]?.id ?? null);
    }
  }, [initialSteps]);

  const selectedStep = steps.find((s) => s.id === selectedId) ?? null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  async function handleDragEnd(event: DragEndEvent) {
    if (!canManageFunnels) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = steps.findIndex((s) => s.id === active.id);
    const newIndex = steps.findIndex((s) => s.id === over.id);
    const reordered = arrayMove(steps, oldIndex, newIndex).map((s, i) => ({ ...s, order: i + 1 }));
    setSteps(reordered);

    await apiFetch(`/api/funnels/${funnel.id}/steps/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: reordered.map((s) => s.id) }),
    });
  }

  async function handleDelete(e: React.MouseEvent, stepId: string) {
    e.stopPropagation();
    const step = steps.find((s) => s.id === stepId);
    const ok = await confirm({
      title: `Delete "${step?.name ?? "this step"}"?`,
      description: "This will permanently remove the step and its content.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;

    setDeleting(stepId);
    await apiFetch(`/api/funnel-steps/${stepId}`, { method: "DELETE" });
    const remaining = steps.filter((s) => s.id !== stepId);
    setSteps(remaining);
    if (selectedId === stepId) {
      setSelectedId(remaining[0]?.id ?? null);
      setMobileView("list");
    }
    setDeleting(null);
    router.refresh();
  }

  function handleStepSelect(stepId: string) {
    setSelectedId(stepId);
    setActiveTab("configuration");
    setMobileView("detail");
  }

  function handleStepUpdate(updated: Step) {
    setSteps((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }

  /* ── Sidebar ── */
  const Sidebar = (
    <div className={`
      bg-white border-r border-gray-200 flex flex-col
      ${/* mobile: full width when in list view */ ""}
      w-full md:w-72 md:shrink-0
      ${mobileView === "list" ? "flex" : "hidden md:flex"}
    `}>
      {/* Header */}
      <div className="px-4 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-900 truncate">{funnel.name}</h2>
          {canManageFunnels && (
            <button
              onClick={() => setSettingsOpen(true)}
              className="shrink-0 flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Settings size={13} />
              Settings
            </button>
          )}
        </div>
      </div>

      {/* Step list */}
      <div className="flex-1 overflow-y-auto">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            {steps.map((step) => (
              <SortableStepItem
                key={step.id}
                step={step}
                isSelected={step.id === selectedId}
                deleting={deleting === step.id}
                canManage={canManageFunnels}
                canDelete={canDeleteFunnels}
                onSelect={() => handleStepSelect(step.id)}
                onDelete={(e) => handleDelete(e, step.id)}
              />
            ))}
          </SortableContext>
        </DndContext>

        {steps.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <p className="text-sm text-gray-400">No steps yet — add your first step below.</p>
          </div>
        )}
      </div>

      {/* Add step */}
      {canManageFunnels && (
        <div className="p-3 border-t border-gray-100">
          <AddStepDialog funnelId={funnel.id} fullWidth />
        </div>
      )}
    </div>
  );

  /* ── Right panel ── */
  const RightPanel = (
    <div className={`
      flex-1 flex flex-col overflow-hidden bg-gray-50
      ${mobileView === "detail" ? "flex" : "hidden md:flex"}
    `}>
      {selectedStep ? (
        <>
          {/* Panel header */}
          <div className="bg-white border-b border-gray-200 px-4 sm:px-6 pt-3 sm:pt-4">
            {/* Mobile back + title row */}
            <div className="flex items-center gap-2 mb-2 md:hidden">
              <button
                onClick={() => setMobileView("list")}
                className="p-1.5 -ml-1 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-sm font-medium text-gray-900 truncate flex-1">{selectedStep.name}</span>
              {/* Mobile quick actions */}
              <a
                href={stepViewUrl(rendererUrl, funnel.primaryDomain, selectedStep.slug)}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                title="View page"
              >
                <Eye size={16} />
              </a>
              {canManageFunnels && (
                <a
                  href={`/${slug}/editor/${selectedStep.id}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  <Pencil size={13} />
                  Edit
                </a>
              )}
            </div>

            {/* Desktop breadcrumb + actions */}
            <div className="hidden md:flex items-center justify-between mb-3">
              <nav className="flex items-center gap-1 text-xs text-gray-400 min-w-0">
                <Link href={`/${slug}/funnels`} className="hover:text-blue-600 transition-colors shrink-0">Funnels</Link>
                <ChevronRight size={11} className="shrink-0" />
                <span className="text-gray-600 truncate max-w-[180px]">{funnel.name}</span>
                <ChevronRight size={11} className="shrink-0" />
                <span className="text-gray-900 font-medium truncate max-w-[180px]">{selectedStep.name}</span>
              </nav>

              <div className="flex items-center gap-2">
                <a
                  href={stepViewUrl(rendererUrl, funnel.primaryDomain, selectedStep.slug)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <Eye size={13} />
                  View
                </a>
                {canManageFunnels && (
                  <a
                    href={`/${slug}/editor/${selectedStep.id}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                  >
                    <Pencil size={13} />
                    Edit page
                  </a>
                )}
                {canManageFunnels && (
                  <button
                    onClick={() => setChangeTemplateOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <RefreshCw size={13} />
                    Change template
                  </button>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-0 overflow-x-auto">
              {ALL_TABS
                .filter((tab) => !tab.types || tab.types.includes(selectedStep.type as any))
                // Hide plan-gated tabs entirely when the license lacks the feature.
                .filter((tab) => (tab.id === "analytics" ? canViewAnalytics : true))
                .filter((tab) => (tab.id === "ab" ? canAbTest : true))
                .map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium whitespace-nowrap transition-colors border-b-2 inline-flex items-center gap-1 ${
                      activeTab === tab.id
                        ? "text-blue-600 border-blue-500"
                        : "text-gray-500 border-transparent hover:text-gray-800"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
            </div>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {activeTab === "configuration" && (
              <ConfigurationTab key={selectedStep.id} step={selectedStep} funnelId={funnel.id} rendererUrl={rendererUrl} primaryDomain={funnel.primaryDomain} onUpdate={handleStepUpdate} />
            )}
            {activeTab === "products"      && <ProductsTab key={selectedStep.id} stepId={selectedStep.id} />}
            {activeTab === "ab"            && (
              <AbTestPanel
                key={selectedStep.id}
                stepId={selectedStep.id}
                workspaceSlug={slug}
                canAbTest={canAbTest}
              />
            )}
            {activeTab === "analytics"     && (
              // Funnel-level analytics — same view on every step (no per-step key
              // so it stays mounted while switching steps).
              <FunnelAnalyticsView
                funnelId={funnel.id}
                canView={canViewAnalytics}
                workspaceSlug={slug}
              />
            )}
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
          <div className="w-14 h-14 rounded-2xl bg-white border border-gray-200 flex items-center justify-center mb-4 shadow-sm">
            <Plus size={22} className="text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-600 mb-1">No step selected</p>
          <p className="text-xs text-gray-400">Select a step from the left or add a new one.</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-full overflow-hidden">
      {Sidebar}
      {RightPanel}

      <FunnelFormDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        mode="edit"
        editId={funnel.id}
        onSuccess={() => { setSettingsOpen(false); router.refresh(); }}
      />

      {changeTemplateOpen && selectedStep && (
        <ChangeTemplateModal
          stepId={selectedStep.id}
          stepType={selectedStep.type as any}
          funnelName={funnel.name}
          onClose={() => setChangeTemplateOpen(false)}
          onApplied={() => router.refresh()}
        />
      )}
    </div>
  );
}
