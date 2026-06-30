"use client";

import { useState, useRef } from "react";
import {
  DndContext, PointerSensor, useSensor, useSensors, closestCenter, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, arrayMove, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { X, Plus, GripVertical, Loader2, Trash2 } from "lucide-react";
import { apiFetch } from "../../lib/api-client";
import { stageColor } from "../../lib/pipeline-colors";
import StageColorPicker from "./StageColorPicker";
import type { Board } from "./PipelineBoard";

type PipelineMeta = { id: string; name: string };
type Row = { key: string; id?: string; name: string; color: string };

const DEFAULT_ROWS = [
  "New leads", "Initial contact made", "Proposal sent", "Negotiation", "Deal won", "Deal lost",
];

function StageRow({
  row, onChange, onColor, onRemove, canRemove,
}: {
  row: Row;
  onChange: (key: string, name: string) => void;
  onColor: (key: string, color: string) => void;
  onRemove: (key: string) => void;
  canRemove: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.key });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm">
      <button
        {...attributes}
        {...listeners}
        className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none shrink-0"
        aria-label="Reorder stage"
      >
        <GripVertical size={16} />
      </button>
      <StageColorPicker color={row.color} size={14} onChange={(hex) => onColor(row.key, hex)} />
      <input
        value={row.name}
        onChange={(e) => onChange(row.key, e.target.value)}
        placeholder="Stage name"
        className="flex-1 min-w-0 text-sm text-blue-600 font-medium bg-transparent focus:outline-none placeholder:text-gray-300"
      />
      {canRemove && (
        <button
          onClick={() => onRemove(row.key)}
          className="p-1 text-gray-300 hover:text-red-500 rounded-md shrink-0"
          title="Remove stage"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

export default function PipelineModal({
  onClose,
  initial,
  onCreated,
  onUpdated,
}: {
  onClose: () => void;
  /** Present → edit mode. */
  initial?: { id: string; name: string; stages: { id: string; name: string; color: string | null }[] };
  onCreated?: (meta: PipelineMeta) => void;
  onUpdated?: (board: Board) => void;
}) {
  const isEdit = !!initial;
  const counter = useRef(0);
  const newKey = () => `s${counter.current++}`;

  const [name, setName] = useState(initial?.name ?? "");
  const [rows, setRows] = useState<Row[]>(() =>
    initial
      ? initial.stages.map((s, i) => ({ key: s.id, id: s.id, name: s.name, color: s.color ?? stageColor(i) }))
      : DEFAULT_ROWS.map((n, i) => ({ key: newKey(), name: n, color: stageColor(i) })),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function updateRow(key: string, value: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, name: value } : r)));
  }
  function updateColor(key: string, color: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, color } : r)));
  }
  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }
  function addRow() {
    setRows((prev) => [...prev, { key: newKey(), name: "", color: stageColor(prev.length) }]);
  }
  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setRows((prev) => {
      const from = prev.findIndex((r) => r.key === active.id);
      const to = prev.findIndex((r) => r.key === over.id);
      return from >= 0 && to >= 0 ? arrayMove(prev, from, to) : prev;
    });
  }

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) { setError("Pipeline name is required"); return; }
    const valid = rows.map((r) => ({ id: r.id, name: r.name.trim(), color: r.color })).filter((s) => s.name);
    if (valid.length === 0) { setError("Add at least one stage"); return; }

    setSaving(true);
    setError("");

    if (isEdit) {
      const res = await apiFetch(`/api/pipelines/${initial!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, stages: valid.map((s) => ({ id: s.id, name: s.name, color: s.color })) }),
      });
      const json = await res.json();
      setSaving(false);
      if (!res.ok) { setError(json.error ?? "Failed to save pipeline"); return; }
      onUpdated?.(json.data as Board);
    } else {
      const res = await apiFetch("/api/pipelines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, stages: valid.map((s) => ({ name: s.name, color: s.color })) }),
      });
      const json = await res.json();
      setSaving(false);
      if (!res.ok) { setError(json.error ?? "Failed to create pipeline"); return; }
      onCreated?.(json.data as PipelineMeta);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">
            {isEdit ? "Edit pipeline" : "Create your pipeline"}
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Pipeline name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-semibold text-gray-900">Stages</h3>
              <button
                onClick={addRow}
                className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                title="Add stage"
              >
                <Plus size={16} />
              </button>
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={rows.map((r) => r.key)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {rows.map((row) => (
                    <StageRow
                      key={row.key}
                      row={row}
                      onChange={updateRow}
                      onColor={updateColor}
                      onRemove={removeRow}
                      canRemove={rows.length > 1}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {isEdit && (
              <p className="text-[11px] text-amber-600 mt-2">
                Removing a stage also removes its contact cards (contacts are kept).
              </p>
            )}
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl transition-colors"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
