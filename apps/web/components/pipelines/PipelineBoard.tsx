"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  closestCorners, type DragStartEvent, type DragOverEvent, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, arrayMove, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDroppable } from "@dnd-kit/core";
import {
  Mail, ExternalLink, X, Plus, Trash2, GripVertical, Loader2, StickyNote,
} from "lucide-react";
import { useConfirm } from "../ui/ConfirmDialog";
import { useRole } from "../../lib/role";
import { apiFetch } from "../../lib/api-client";
import AddContactModal from "./AddContactModal";
import StageColorPicker from "./StageColorPicker";
import CardNotesModal from "./CardNotesModal";

type Tag = { id: string; name: string; color: string | null };
type Contact = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  tags: Tag[];
};
type Card = { id: string; contact: Contact };
type Stage = { id: string; name: string; color: string | null; position: number; cards: Card[] };
export type Board = { id: string; name: string; stages: Stage[] };

function displayName(c: Contact): string {
  const full = [c.firstName, c.lastName].filter(Boolean).join(" ");
  return full || c.email;
}

// ─── Card ──────────────────────────────────────────────────────────────────
function ContactCard({
  card, slug, onRemove, onNotes, canManage,
}: {
  card: Card; slug: string; onRemove: (id: string) => void; onNotes: (contact: Contact) => void; canManage: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id, data: { type: "card" } });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const c = card.contact;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group bg-white border border-gray-200 rounded-xl p-3 shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="flex items-start gap-2">
        {canManage && (
          <button
            {...attributes}
            {...listeners}
            className="mt-0.5 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none"
            aria-label="Drag"
          >
            <GripVertical size={14} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 truncate">{displayName(c)}</p>
          <p className="text-xs text-gray-500 truncate">{c.email}</p>
          {c.company && <p className="text-xs text-gray-400 truncate">{c.company}</p>}
        </div>
      </div>

      <div className="flex items-center gap-1 mt-2 pt-2 border-t border-gray-50 opacity-0 group-hover:opacity-100 transition-opacity">
        <Link
          href={`/${slug}/contacts/${c.id}`}
          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          title="Open contact record"
        >
          <ExternalLink size={13} />
        </Link>
        <a
          href={`mailto:${c.email}`}
          className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
          title="Send email"
        >
          <Mail size={13} />
        </a>
        <button
          onClick={() => onNotes(c)}
          className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
          title="Notes"
        >
          <StickyNote size={13} />
        </button>
        {canManage && (
          <button
            onClick={() => onRemove(card.id)}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors ml-auto"
            title="Remove from pipeline"
          >
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Column ────────────────────────────────────────────────────────────────
function Column({
  stage, slug, canManage, onAddContact, onRemoveCard, onNotes, onRenameStage, onDeleteStage, onSetColor,
}: {
  stage: Stage;
  slug: string;
  canManage: boolean;
  onAddContact: (stageId: string) => void;
  onRemoveCard: (cardId: string) => void;
  onNotes: (contact: Contact) => void;
  onRenameStage: (stageId: string, name: string) => void;
  onDeleteStage: (stageId: string) => void;
  onSetColor: (stageId: string, color: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id, data: { type: "column" } });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(stage.name);
  const color = stage.color ?? "#94a3b8";

  function commit() {
    const trimmed = name.trim();
    setEditing(false);
    if (trimmed && trimmed !== stage.name) onRenameStage(stage.id, trimmed);
    else setName(stage.name);
  }

  return (
    <div className="flex flex-col w-72 shrink-0 bg-white rounded-2xl border border-gray-200 shadow-sm max-h-full overflow-hidden">
      {/* colored accent cap so each stage reads at a glance against the board */}
      <div className="h-1 shrink-0" style={{ backgroundColor: color }} />

      <div
        className="flex items-center gap-2 px-3 py-2.5 shrink-0 border-b border-gray-100"
        style={{ backgroundColor: `${color}0f` }}
      >
        {canManage ? (
          <StageColorPicker color={stage.color} onChange={(hex) => onSetColor(stage.id, hex)} />
        ) : (
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
        )}
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setName(stage.name); setEditing(false); } }}
            className="flex-1 min-w-0 text-sm font-semibold bg-white border border-blue-300 rounded-md px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        ) : (
          <button
            disabled={!canManage}
            onClick={() => setEditing(true)}
            className="flex-1 min-w-0 text-left text-sm font-semibold text-gray-800 truncate disabled:cursor-default"
            title={canManage ? "Click to rename" : undefined}
          >
            {stage.name}
          </button>
        )}
        <span
          className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
          style={{ backgroundColor: `${color}1f`, color }}
        >
          {stage.cards.length}
        </span>
        {canManage && (
          <button
            onClick={() => onDeleteStage(stage.id)}
            className="p-1 text-gray-300 hover:text-red-500 rounded-md hover:bg-white shrink-0"
            title="Delete stage"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      <div
        ref={setNodeRef}
        className={`flex-1 overflow-y-auto px-2 py-2 space-y-2 min-h-[60px] bg-gray-50 transition-colors ${isOver ? "bg-blue-50/60" : ""}`}
      >
        <SortableContext items={stage.cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {stage.cards.map((card) => (
            <ContactCard key={card.id} card={card} slug={slug} onRemove={onRemoveCard} onNotes={onNotes} canManage={canManage} />
          ))}
        </SortableContext>
        {stage.cards.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-8 border-2 border-dashed border-gray-200 rounded-xl">
            Drop contacts here
          </p>
        )}
      </div>

      {canManage && (
        <button
          onClick={() => onAddContact(stage.id)}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-500 hover:text-blue-600 bg-white hover:bg-gray-50 border-t border-gray-100 transition-colors shrink-0"
        >
          <Plus size={13} /> Add contact
        </button>
      )}
    </div>
  );
}

// ─── Board ───────────────────────────────────────────────────────────────────
export default function PipelineBoard({ initialBoard }: { initialBoard: Board }) {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const { canManagePipelines } = useRole();
  const confirm = useConfirm();

  const [stages, setStages] = useState<Stage[]>(initialBoard.stages);
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [addStageId, setAddStageId] = useState<string | null>(null);
  const [notesContact, setNotesContact] = useState<Contact | null>(null);
  const [addingStage, setAddingStage] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // Snapshot for rollback if a persisted move fails.
  const preDrag = useRef<Stage[] | null>(null);

  const stageOf = (cardId: string) => stages.find((s) => s.cards.some((c) => c.id === cardId));
  const columnId = (id: string): string | null => {
    if (stages.some((s) => s.id === id)) return id;
    return stageOf(id)?.id ?? null;
  };

  function handleDragStart(e: DragStartEvent) {
    preDrag.current = stages;
    const card = stages.flatMap((s) => s.cards).find((c) => c.id === e.active.id);
    setActiveCard(card ?? null);
  }

  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const from = columnId(active.id as string);
    const to = columnId(over.id as string);
    if (!from || !to || from === to) return;

    setStages((prev) => {
      const fromStage = prev.find((s) => s.id === from)!;
      const toStage = prev.find((s) => s.id === to)!;
      const card = fromStage.cards.find((c) => c.id === active.id);
      if (!card) return prev;

      // Insert at the hovered card's index, or append when hovering the column.
      const overIsCard = over.id !== to;
      const insertIdx = overIsCard ? toStage.cards.findIndex((c) => c.id === over.id) : toStage.cards.length;

      return prev.map((s) => {
        if (s.id === from) return { ...s, cards: s.cards.filter((c) => c.id !== active.id) };
        if (s.id === to) {
          const next = [...s.cards];
          next.splice(insertIdx < 0 ? next.length : insertIdx, 0, card);
          return { ...s, cards: next };
        }
        return s;
      });
    });
  }

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveCard(null);
    if (!over) { preDrag.current = null; return; }

    const to = columnId(over.id as string);
    if (!to) { preDrag.current = null; return; }

    // Reorder within the destination column.
    let finalIdx = 0;
    setStages((prev) =>
      prev.map((s) => {
        if (s.id !== to) return s;
        const oldIdx = s.cards.findIndex((c) => c.id === active.id);
        const overIdx = over.id === to ? s.cards.length - 1 : s.cards.findIndex((c) => c.id === over.id);
        const newCards = oldIdx >= 0 && overIdx >= 0 ? arrayMove(s.cards, oldIdx, overIdx) : s.cards;
        finalIdx = newCards.findIndex((c) => c.id === active.id);
        return { ...s, cards: newCards };
      })
    );

    try {
      const res = await apiFetch(`/api/pipelines/cards/${active.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageId: to, position: Math.max(0, finalIdx) }),
      });
      if (!res.ok) throw new Error();
    } catch {
      if (preDrag.current) setStages(preDrag.current);
    } finally {
      preDrag.current = null;
    }
  }

  async function handleRemoveCard(cardId: string) {
    const ok = await confirm({
      title: "Remove from pipeline?",
      description: "This removes the contact's card.",
      confirmLabel: "Remove",
      variant: "warning",
    });
    if (!ok) return;
    const snapshot = stages;
    setStages((prev) => prev.map((s) => ({ ...s, cards: s.cards.filter((c) => c.id !== cardId) })));
    const res = await apiFetch(`/api/pipelines/cards/${cardId}`, { method: "DELETE" });
    if (!res.ok) setStages(snapshot);
  }

  async function handleRenameStage(stageId: string, name: string) {
    setStages((prev) => prev.map((s) => (s.id === stageId ? { ...s, name } : s)));
    await apiFetch(`/api/pipelines/stages/${stageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
  }

  async function handleSetStageColor(stageId: string, color: string) {
    const snapshot = stages;
    setStages((prev) => prev.map((s) => (s.id === stageId ? { ...s, color } : s)));
    const res = await apiFetch(`/api/pipelines/stages/${stageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color }),
    });
    if (!res.ok) setStages(snapshot);
  }

  async function handleDeleteStage(stageId: string) {
    const stage = stages.find((s) => s.id === stageId);
    if (!stage) return;
    const ok = await confirm({
      title: `Delete "${stage.name}"?`,
      description: stage.cards.length
        ? `This stage has ${stage.cards.length} contact(s). Their cards will be removed (contacts are kept).`
        : "This stage will be removed.",
      confirmLabel: "Delete stage",
      variant: "danger",
    });
    if (!ok) return;
    const snapshot = stages;
    setStages((prev) => prev.filter((s) => s.id !== stageId));
    const res = await apiFetch(`/api/pipelines/stages/${stageId}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setStages(snapshot);
      if (j?.error) alert(j.error);
    }
  }

  async function handleAddStage() {
    setAddingStage(true);
    const res = await apiFetch(`/api/pipelines/${initialBoard.id}/stages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Stage" }),
    });
    const j = await res.json();
    setAddingStage(false);
    if (res.ok) setStages((prev) => [...prev, { ...j.data, cards: [] }]);
  }

  function handleContactAdded(stageId: string, card: Card) {
    // Avoid dupes: drop the contact's card from any stage, then add to target.
    setStages((prev) =>
      prev.map((s) => {
        const filtered = s.cards.filter((c) => c.contact.id !== card.contact.id);
        return s.id === stageId ? { ...s, cards: [...filtered, card] } : { ...s, cards: filtered };
      })
    );
  }

  return (
    <>
      <div className="flex-1 min-w-0 overflow-x-auto overflow-y-hidden p-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-3 h-full items-start">
            {stages.map((stage) => (
              <Column
                key={stage.id}
                stage={stage}
                slug={workspaceSlug}
                canManage={canManagePipelines}
                onAddContact={setAddStageId}
                onRemoveCard={handleRemoveCard}
                onNotes={setNotesContact}
                onRenameStage={handleRenameStage}
                onDeleteStage={handleDeleteStage}
                onSetColor={handleSetStageColor}
              />
            ))}

            {canManagePipelines && (
              <button
                onClick={handleAddStage}
                disabled={addingStage}
                className="flex items-center justify-center gap-1.5 w-44 shrink-0 px-3 py-2.5 text-sm font-medium text-gray-500 hover:text-blue-600 bg-white/70 hover:bg-white border border-dashed border-gray-300 hover:border-blue-300 rounded-2xl shadow-sm transition-colors"
              >
                {addingStage ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Add stage
              </button>
            )}
          </div>

          <DragOverlay>
            {activeCard ? (
              <div className="bg-white border border-blue-300 rounded-xl p-3 shadow-lg w-64 rotate-2">
                <p className="text-sm font-medium text-gray-900 truncate">{displayName(activeCard.contact)}</p>
                <p className="text-xs text-gray-500 truncate">{activeCard.contact.email}</p>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {addStageId && (
        <AddContactModal
          stageId={addStageId}
          onClose={() => setAddStageId(null)}
          onAdded={handleContactAdded}
        />
      )}

      {notesContact && (
        <CardNotesModal contact={notesContact} onClose={() => setNotesContact(null)} />
      )}
    </>
  );
}
