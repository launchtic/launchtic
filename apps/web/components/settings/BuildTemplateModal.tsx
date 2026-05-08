"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  X, Loader2, Plus, Search, GripVertical, Wand2, Trash2,
  FileText, TrendingUp, ShoppingCart, CheckCircle,
} from "lucide-react";
import {
  DndContext, PointerSensor, useSensor, useSensors,
  closestCenter, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, arrayMove, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type StepType = "OPTIN" | "SALES" | "CHECKOUT" | "UPSELL" | "DOWNSELL" | "THANKYOU" | "CUSTOM";

type SavedBlockListItem = {
  id: string;
  name: string;
  kind: "section" | "row";
  tags: string[];
  slotCount: number;
};

// UPSELL / DOWNSELL exist in DB enum but aren't user-supported yet —
// hidden from creation/selection. Existing records still render via the
// display maps in ChangeTemplateModal / FunnelStepManager / StepList.
const STEP_TYPES: { value: StepType; label: string; icon: React.ReactNode }[] = [
  { value: "OPTIN",    label: "Opt-in",    icon: <FileText size={12} /> },
  { value: "SALES",    label: "Sales",     icon: <TrendingUp size={12} /> },
  { value: "CHECKOUT", label: "Checkout",  icon: <ShoppingCart size={12} /> },
  { value: "THANKYOU", label: "Thank You", icon: <CheckCircle size={12} /> },
  { value: "CUSTOM",   label: "Custom",    icon: <FileText size={12} /> },
];

type Props = {
  onClose: () => void;
  onCreated: (templateId: string) => void;
};

const TONE_OPTIONS = ["Professional", "Friendly", "Bold", "Empathetic", "Playful"] as const;

export function BuildTemplateModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [type, setType] = useState<StepType>("SALES");
  const [picked, setPicked] = useState<SavedBlockListItem[]>([]);
  const [allBlocks, setAllBlocks] = useState<SavedBlockListItem[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerTag, setPickerTag] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [buildStage, setBuildStage] = useState<"idle" | "building" | "navigating">("idle");
  const [error, setError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // AI brief
  const [useAi, setUseAi] = useState(true);
  const [industry, setIndustry] = useState("");
  const [tone, setTone] = useState<typeof TONE_OPTIONS[number]>("Professional");
  const [audience, setAudience] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  // Load all section-kind saved blocks so user can pick from them
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/saved-blocks?kind=section");
        const json = await res.json();
        if (!alive) return;
        if (res.ok && json.success) {
          setAllBlocks(json.data.items as SavedBlockListItem[]);
        }
      } catch {
        // ignore — error UI shows on submit if needed
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const availableBlocks = useMemo(() => {
    const pickedIds = new Set(picked.map((b) => b.id));
    let list = allBlocks.filter((b) => !pickedIds.has(b.id));
    if (pickerTag) list = list.filter((b) => b.tags.includes(pickerTag));
    if (pickerSearch) {
      const q = pickerSearch.trim().toLowerCase();
      list = list.filter((b) => b.name.toLowerCase().includes(q));
    }
    return list;
  }, [allBlocks, picked, pickerTag, pickerSearch]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const b of allBlocks) for (const t of b.tags) s.add(t);
    return Array.from(s).sort();
  }, [allBlocks]);

  const totalSlots = useMemo(
    () => picked.reduce((sum, b) => sum + b.slotCount, 0),
    [picked],
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setPicked((prev) => {
      const oldIdx = prev.findIndex((b) => b.id === active.id);
      const newIdx = prev.findIndex((b) => b.id === over.id);
      if (oldIdx < 0 || newIdx < 0) return prev;
      return arrayMove(prev, oldIdx, newIdx);
    });
  };

  const addBlock = (block: SavedBlockListItem) => {
    setPicked((prev) => [...prev, block]);
    setPickerOpen(false);
    setPickerSearch("");
  };

  const removeBlock = (id: string) => {
    setPicked((prev) => prev.filter((b) => b.id !== id));
  };

  const willUseAi = useAi && totalSlots > 0;

  const handleBuild = async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (picked.length === 0) {
      setError("Add at least one section");
      return;
    }
    if (willUseAi && !industry.trim()) {
      setError("Industry is required when AI fill is enabled");
      return;
    }
    setBuilding(true);
    setBuildStage("building");
    setError(null);
    try {
      const res = await fetch("/api/page-templates/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          type,
          blockIds: picked.map((b) => b.id),
          ...(willUseAi
            ? {
                aiBrief: {
                  industry: industry.trim(),
                  tone,
                  audience: audience.trim() || undefined,
                  notes:    notes.trim()    || undefined,
                },
              }
            : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Build failed");

      // Don't reset `building` — keep the loading UI visible during the
      // route change to /page-template-editor/[id]. The modal unmounts
      // when the new route renders, so the spinner stays continuous.
      setBuildStage("navigating");
      onCreated(json.data.id);
    } catch (e: any) {
      setError(e?.message || "Build failed");
      setBuilding(false);
      setBuildStage("idle");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Wand2 size={16} className="text-blue-600" />
            <h2 className="text-sm font-semibold text-gray-900">Build template from blocks</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Template name <span className="text-red-500">*</span>
            </label>
            <input
              ref={nameInputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="SaaS landing v1"
              maxLength={100}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Page type</label>
            <div className="grid grid-cols-3 gap-2">
              {STEP_TYPES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setType(s.value)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${
                    type === s.value
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {s.icon}
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Picked blocks list (drag-reorder) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-gray-700">
                Sections (drag to reorder)
              </label>
              <span className="text-[11px] text-gray-500">
                {totalSlots > 0 ? `🪄 ${totalSlots} slots total` : "no slots"}
              </span>
            </div>

            {picked.length === 0 ? (
              <div className="border border-dashed border-gray-300 rounded-xl px-4 py-6 text-center text-xs text-gray-500">
                Add sections from your saved blocks library to compose this template.
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={picked.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1.5">
                    {picked.map((block, idx) => (
                      <SortableBlockRow
                        key={block.id}
                        block={block}
                        index={idx + 1}
                        onRemove={() => removeBlock(block.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}

            {/* Add block trigger */}
            {!pickerOpen && (
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-xl text-xs text-gray-600 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
              >
                <Plus size={13} /> Add section from library
              </button>
            )}

            {/* Picker dropdown */}
            {pickerOpen && (
              <div className="mt-2 border border-gray-200 rounded-xl bg-gray-50 p-3">
                <div className="relative mb-2">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    autoFocus
                    value={pickerSearch}
                    onChange={(e) => setPickerSearch(e.target.value)}
                    placeholder="Search saved blocks..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>

                {allTags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    <button
                      type="button"
                      onClick={() => setPickerTag(null)}
                      className={`text-[10px] px-2 py-0.5 rounded-full border ${
                        pickerTag === null
                          ? "bg-blue-100 border-blue-300 text-blue-700"
                          : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      All
                    </button>
                    {allTags.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setPickerTag((prev) => (prev === t ? null : t))}
                        className={`text-[10px] px-2 py-0.5 rounded-full border ${
                          pickerTag === t
                            ? "bg-blue-100 border-blue-300 text-blue-700"
                            : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}

                <div className="max-h-48 overflow-y-auto space-y-1">
                  {loading ? (
                    <div className="text-xs text-gray-500 px-2 py-3 text-center">Loading...</div>
                  ) : availableBlocks.length === 0 ? (
                    <div className="text-xs text-gray-500 px-2 py-3 text-center">
                      {allBlocks.length === 0
                        ? "No saved blocks yet. Save Sections from the editor first."
                        : "No matching blocks."}
                    </div>
                  ) : (
                    availableBlocks.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => addBlock(b)}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs hover:border-blue-400 hover:bg-blue-50 transition-colors text-left"
                      >
                        <span className="font-medium text-gray-800 flex-1 truncate">{b.name}</span>
                        {b.slotCount > 0 && (
                          <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                            🪄 {b.slotCount}
                          </span>
                        )}
                        {b.tags.slice(0, 2).map((t) => (
                          <span key={t} className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                            {t}
                          </span>
                        ))}
                      </button>
                    ))
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setPickerOpen(false)}
                  className="mt-2 w-full text-[11px] text-gray-500 hover:text-gray-700 py-1"
                >
                  Close
                </button>
              </div>
            )}
          </div>

          {/* AI Brief — visible when there are slots to fill */}
          {totalSlots > 0 && (
            <div className="border-t border-gray-200 pt-5">
              <label className="flex items-center gap-2 mb-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={useAi}
                  onChange={(e) => setUseAi(e.target.checked)}
                  className="rounded"
                />
                <span className="text-xs font-medium text-gray-800">
                  ✨ Use AI to fill {totalSlots} slot{totalSlots > 1 ? "s" : ""}
                </span>
              </label>

              {useAi && (
                <div className="space-y-3 pl-6">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                      Industry / niche <span className="text-red-500">*</span>
                    </label>
                    <input
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                      placeholder="e.g. SaaS analytics tool, Fitness coaching, B2B consulting"
                      maxLength={200}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Tone</label>
                    <div className="flex flex-wrap gap-1.5">
                      {TONE_OPTIONS.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setTone(t)}
                          className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${
                            tone === t
                              ? "border-blue-500 bg-blue-50 text-blue-700"
                              : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                      Target audience <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <input
                      value={audience}
                      onChange={(e) => setAudience(e.target.value)}
                      placeholder="e.g. B2B marketing managers, 30-45"
                      maxLength={500}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                      Notes <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Anything else for the AI: USPs, key features, brand voice..."
                      maxLength={1000}
                      rows={2}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            disabled={building}
            className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={handleBuild}
            disabled={building || !name.trim() || picked.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-medium hover:bg-blue-700 disabled:opacity-60 min-w-[160px] justify-center"
          >
            {building ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
            {buildStage === "navigating"
              ? "Opening editor..."
              : buildStage === "building"
                ? willUseAi
                  ? "Generating with AI..."
                  : "Building..."
                : willUseAi
                  ? "Build with AI"
                  : "Build template"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SortableBlockRow({
  block, index, onRemove,
}: { block: SavedBlockListItem; index: number; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-2.5 py-2 bg-white border border-gray-200 rounded-lg"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing"
        title="Drag to reorder"
      >
        <GripVertical size={14} />
      </button>
      <span className="text-[10px] text-gray-500 font-mono w-5">{index}.</span>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
        {block.kind}
      </span>
      <span className="flex-1 text-xs text-gray-800 truncate" title={block.name}>{block.name}</span>
      {block.slotCount > 0 && (
        <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded shrink-0">
          🪄 {block.slotCount}
        </span>
      )}
      {block.tags.slice(0, 1).map((t) => (
        <span key={t} className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
          {t}
        </span>
      ))}
      <button
        type="button"
        onClick={onRemove}
        className="p-1 text-gray-400 hover:text-red-600"
        title="Remove"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}
