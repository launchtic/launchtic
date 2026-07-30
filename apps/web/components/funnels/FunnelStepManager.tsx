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
  Copy,
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
import TemplateGallery from "./TemplateGallery";
import { apiFetch } from "../../lib/api-client";
import { useRole } from "../../lib/role";

type Step = {
  id: string;
  name: string;
  slug: string;
  type: string;
  order: number;
  // One-click upsell/downsell branching targets (UPSELL/DOWNSELL steps only).
  acceptStepId?: string | null;
  declineStepId?: string | null;
  // False until a template is applied or content is built (pageJson is still
  // the empty canvas) — drives the inline template picker.
  hasContent?: boolean;
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
  { id: "products",      label: "Products",      types: ["CHECKOUT", "UPSELL", "DOWNSELL"] },
  { id: "ab",            label: "A/B Test",      types: null },
  { id: "analytics",     label: "Analytics",     types: null },
] as const;

/* ─── Sortable step row ─── */
function SortableStepItem({
  step,
  isSelected,
  deleting,
  cloning,
  canManage,
  canDelete,
  onSelect,
  onClone,
  onDelete,
}: {
  step: Step;
  isSelected: boolean;
  deleting: boolean;
  cloning: boolean;
  canManage: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onClone: (e: React.MouseEvent) => void;
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
      <div className="flex-1 min-w-0 pr-14">
        <p className={`text-sm font-medium truncate leading-tight ${isSelected ? "text-blue-700" : "text-gray-800"}`}>
          {step.name}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          {TYPE_LABEL_MAP[step.type] ?? step.type}
        </p>
      </div>

      {/* Row actions — hover-reveal on desktop, always visible on mobile */}
      {(canManage || canDelete) && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 transition-opacity sm:opacity-0 sm:group-hover/item:opacity-100">
          {canManage && (
            <button
              onClick={onClone}
              disabled={cloning}
              className="p-1.5 text-gray-300 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-40"
              title="Duplicate step"
            >
              {cloning ? <Loader2 size={13} className="animate-spin" /> : <Copy size={13} />}
            </button>
          )}
          {canDelete && (
            <button
              onClick={onDelete}
              disabled={deleting}
              className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-40"
              title="Delete step"
            >
              {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Configuration tab ─── */
function ConfigurationTab({ step, steps, rendererUrl, primaryDomain, onUpdate }: { step: Step; steps: Step[]; funnelId: string; rendererUrl: string; primaryDomain: string | null; onUpdate: (updated: Step) => void }) {
  const urlPrefix = stepUrlPrefix(rendererUrl, primaryDomain);
  const { canManageFunnels } = useRole();
  const [name, setName] = useState(step.name);
  const [slug, setSlug] = useState(step.slug);
  const [acceptStepId, setAcceptStepId] = useState<string>(step.acceptStepId ?? "");
  const [declineStepId, setDeclineStepId] = useState<string>(step.declineStepId ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isUpsell = step.type === "UPSELL" || step.type === "DOWNSELL";
  const showBranching = isUpsell;
  // Branch targets: any other step in this funnel.
  const branchOptions = steps.filter((s) => s.id !== step.id);

  useEffect(() => {
    setName(step.name);
    setSlug(step.slug);
    setAcceptStepId(step.acceptStepId ?? "");
    setDeclineStepId(step.declineStepId ?? "");
    setSaved(false);
    setError(null);
  }, [step.id]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const body: Record<string, unknown> = { name, slug };
    if (showBranching) {
      body.acceptStepId = acceptStepId || null;
      body.declineStepId = declineStepId || null;
    }
    const res = await apiFetch(`/api/funnel-steps/${step.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(json.error ?? "Failed to save");
      return;
    }

    setSaved(true);
    onUpdate({ ...step, name, slug, ...(showBranching ? { acceptStepId: acceptStepId || null, declineStepId: declineStepId || null } : {}) });
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

      {showBranching && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 mb-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Offer flow</h3>
          <p className="text-xs text-gray-400 mb-4">
            Where to send the visitor after they accept or decline this offer.
            Leave as “Next step” to follow the funnel order.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">When accepted →</label>
              <select
                value={acceptStepId}
                onChange={(e) => setAcceptStepId(e.target.value)}
                disabled={!canManageFunnels}
                className={`w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${!canManageFunnels ? "bg-gray-50 cursor-not-allowed text-gray-500" : ""}`}
              >
                <option value="">Next step (default)</option>
                {branchOptions.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">When declined →</label>
              <select
                value={declineStepId}
                onChange={(e) => setDeclineStepId(e.target.value)}
                disabled={!canManageFunnels}
                className={`w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${!canManageFunnels ? "bg-gray-50 cursor-not-allowed text-gray-500" : ""}`}
              >
                <option value="">Next step (default)</option>
                {branchOptions.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

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
}: {
  funnel: Funnel;
  initialSteps: Step[];
  rendererUrl: string;
}) {
  const { canManageFunnels, canDeleteFunnels } = useRole();
  const [steps, setSteps] = useState(initialSteps);
  const [selectedId, setSelectedId] = useState<string | null>(initialSteps[0]?.id ?? null);
  const [activeTab, setActiveTab] = useState("configuration");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [cloning, setCloning] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Inline template picker: shown automatically for a step with no content,
  // or when the operator chooses to change an existing step's template.
  const [pickingTemplate, setPickingTemplate] = useState(false);
  // Steps where the operator opted to "Start from blank" this session — so we
  // stop auto-showing the picker for them even though they're still empty.
  const [blankDismissed, setBlankDismissed] = useState<Set<string>>(new Set());
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

  // Auto-open the template picker for an empty step (unless the operator chose
  // to start blank). Re-evaluates when the selected step or its content changes.
  useEffect(() => {
    setPickingTemplate(
      !!selectedStep && !selectedStep.hasContent && !blankDismissed.has(selectedStep.id),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selectedStep?.hasContent]);

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

  async function handleClone(e: React.MouseEvent, stepId: string) {
    e.stopPropagation();
    setCloning(stepId);
    const res = await apiFetch(`/api/funnel-steps/${stepId}/clone`, { method: "POST" });
    const json = await res.json();
    setCloning(null);
    if (!res.ok) {
      alert(json.error ?? "Failed to duplicate step");
      return;
    }
    // A clone copies the source page, so it already has content.
    const newStep: Step = { ...json.data, hasContent: true };
    // Insert the copy right after the original, then renumber order locally.
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s.id === stepId);
      const next = [...prev];
      next.splice(idx < 0 ? prev.length : idx + 1, 0, newStep);
      return next.map((s, i) => ({ ...s, order: i + 1 }));
    });
    setSelectedId(newStep.id);
    setActiveTab("configuration");
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

  // Focus the newly added step (previously the selection stayed on the first
  // step). Optimistically append + select so there's no flicker; the dialog's
  // router.refresh() then reconciles the list with server data and the selection
  // persists because this id now exists in initialSteps.
  function handleStepAdded(newStep: Step) {
    const step: Step = { ...newStep, hasContent: false };
    setSteps((prev) => [...prev, step]);
    setSelectedId(step.id);
    setActiveTab("configuration");
    setMobileView("detail");
  }

  // Open the inline picker. For a step that already has content, confirm first
  // — applying a template replaces the current page.
  async function handleChangeTemplate() {
    if (!selectedStep) return;
    if (selectedStep.hasContent) {
      const ok = await confirm({
        title: "Replace page content?",
        description: "Applying a template overwrites this step's current page. This can't be undone.",
        confirmLabel: "Choose a template",
        variant: "danger",
      });
      if (!ok) return;
    }
    setPickingTemplate(true);
  }

  // Template applied → step now has content; leave the picker.
  function handleTemplateApplied() {
    if (selectedStep) handleStepUpdate({ ...selectedStep, hasContent: true });
    setPickingTemplate(false);
    setActiveTab("configuration");
    router.refresh();
  }

  // "Start from blank" — dismiss the picker for this empty step and open the
  // page editor so the operator builds from scratch.
  function handleStartBlank() {
    if (!selectedStep) return;
    setBlankDismissed((prev) => new Set(prev).add(selectedStep.id));
    setPickingTemplate(false);
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
        {/* Stable id so dnd-kit's accessibility id (aria-describedby) is
            deterministic — without it, its auto-increment counter differs
            between SSR and client and React throws a hydration mismatch. */}
        <DndContext id="funnel-steps" sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            {steps.map((step) => (
              <SortableStepItem
                key={step.id}
                step={step}
                isSelected={step.id === selectedId}
                deleting={deleting === step.id}
                cloning={cloning === step.id}
                canManage={canManageFunnels}
                canDelete={canDeleteFunnels}
                onSelect={() => handleStepSelect(step.id)}
                onClone={(e) => handleClone(e, step.id)}
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
          <AddStepDialog funnelId={funnel.id} fullWidth onAdded={handleStepAdded} />
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
                {canManageFunnels && !pickingTemplate && (
                  <button
                    onClick={handleChangeTemplate}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <RefreshCw size={13} />
                    {selectedStep.hasContent ? "Change template" : "Choose template"}
                  </button>
                )}
              </div>
            </div>

            {/* Tabs (hidden while the template picker is open) */}
            {!pickingTemplate && (
            <div className="flex items-center gap-0 overflow-x-auto">
              {ALL_TABS
                .filter((tab) => !tab.types || tab.types.includes(selectedStep.type as any))
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
            )}
          </div>

          {/* Content: inline template picker for empty / change-template steps,
              otherwise the active tab. */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {pickingTemplate ? (
              <TemplateGallery
                key={selectedStep.id}
                stepId={selectedStep.id}
                stepType={selectedStep.type as any}
                funnelName={funnel.name}
                title={selectedStep.hasContent ? "Change template" : "Choose a template to get started"}
                subtitle={`For "${selectedStep.name}" — applying a template builds this page.`}
                onApplied={handleTemplateApplied}
                onBlank={selectedStep.hasContent ? undefined : handleStartBlank}
              />
            ) : (
            <>
            {activeTab === "configuration" && (
              <ConfigurationTab key={selectedStep.id} step={selectedStep} steps={steps} funnelId={funnel.id} rendererUrl={rendererUrl} primaryDomain={funnel.primaryDomain} onUpdate={handleStepUpdate} />
            )}
            {activeTab === "products"      && <ProductsTab key={selectedStep.id} stepId={selectedStep.id} stepType={selectedStep.type} />}
            {activeTab === "ab"            && (
              <AbTestPanel
                key={selectedStep.id}
                stepId={selectedStep.id}
                workspaceSlug={slug}
              />
            )}
            {activeTab === "analytics"     && (
              // Funnel-level analytics — same view on every step (no per-step key
              // so it stays mounted while switching steps).
              <FunnelAnalyticsView funnelId={funnel.id} />
            )}
            </>
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
    </div>
  );
}
