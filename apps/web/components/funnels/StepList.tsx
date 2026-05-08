"use client";

import { useState, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
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
import { GripVertical, Pencil, Trash2, Loader2, Eye } from "lucide-react";

const RENDERER_URL = process.env.NEXT_PUBLIC_RENDERER_URL ?? "http://localhost:3001";
import { useRouter } from "next/navigation";
import { useConfirm } from "../ui/ConfirmDialog";

type Step = {
  id: string;
  name: string;
  slug: string;
  type: string;
  order: number;
};

const TYPE_COLORS: Record<string, string> = {
  OPTIN:    "bg-violet-50 text-violet-700",
  SALES:    "bg-blue-50 text-blue-700",
  CHECKOUT: "bg-amber-50 text-amber-700",
  UPSELL:   "bg-green-50 text-green-700",
  DOWNSELL: "bg-orange-50 text-orange-700",
  THANKYOU: "bg-teal-50 text-teal-700",
  CUSTOM:   "bg-gray-50 text-gray-700",
};

function SortableStep({
  step,
  onDelete,
  deleting,
}: {
  step: Step;
  onDelete: (id: string) => void;
  deleting: string | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isDeleting = deleting === step.id;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 px-4 py-3.5 bg-white rounded-xl border border-gray-200 hover:border-gray-300 transition-colors"
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical size={16} />
      </button>

      {/* Step number */}
      <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-500 shrink-0">
        {step.order}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-900 truncate">{step.name}</p>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${TYPE_COLORS[step.type] ?? "bg-gray-100 text-gray-600"}`}>
            {step.type}
          </span>
        </div>
        <p className="text-xs text-gray-400 mt-0.5 font-mono">/{step.slug}</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5">
        <a
          href={`${RENDERER_URL}/${step.slug}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-gray-900 transition-colors"
        >
          <Eye size={12} />
          View
        </a>
        <a
          href={`/editor/${step.id}`}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-gray-900 transition-colors"
        >
          <Pencil size={12} />
          Edit
        </a>
        <button
          onClick={() => onDelete(step.id)}
          disabled={isDeleting}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
        >
          {isDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
          Delete
        </button>
      </div>
    </div>
  );
}

export default function StepList({ funnelId, initialSteps }: { funnelId: string; initialSteps: Step[] }) {
  const [steps, setSteps] = useState(initialSteps);
  const [deleting, setDeleting] = useState<string | null>(null);
  const router = useRouter();
  const confirm = useConfirm();

  useEffect(() => {
    setSteps(initialSteps);
  }, [initialSteps]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = steps.findIndex((s) => s.id === active.id);
    const newIndex = steps.findIndex((s) => s.id === over.id);
    const reordered = arrayMove(steps, oldIndex, newIndex).map((s, i) => ({ ...s, order: i + 1 }));
    setSteps(reordered);

    await fetch(`/api/funnels/${funnelId}/steps/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: reordered.map((s) => s.id) }),
    });
  }

  async function handleDelete(stepId: string) {
    const step = steps.find((s) => s.id === stepId);
    const ok = await confirm({
      title: `Delete "${step?.name ?? "this step"}"?`,
      description: "This will permanently remove the step and its content.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    setDeleting(stepId);
    await fetch(`/api/funnel-steps/${stepId}`, { method: "DELETE" });
    setSteps((prev) => prev.filter((s) => s.id !== stepId));
    setDeleting(null);
    router.refresh();
  }

  if (steps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-gray-200 rounded-xl">
        <p className="text-sm text-gray-500">No steps yet — add your first step above.</p>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2">
          {steps.map((step) => (
            <SortableStep key={step.id} step={step} onDelete={handleDelete} deleting={deleting} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
