"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, Pencil, Trash2, Loader2 } from "lucide-react";
import { useConfirm } from "../ui/ConfirmDialog";
import { useRole } from "../../lib/role";
import { apiFetch } from "../../lib/api-client";
import PipelineBoard, { type Board } from "./PipelineBoard";
import PipelineModal from "./PipelineModal";

export default function PipelineDetailClient({ initialBoard }: { initialBoard: Board }) {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const router = useRouter();
  const confirm = useConfirm();
  const { canManagePipelines, canDeletePipelines } = useRole();

  const [board, setBoard] = useState<Board>(initialBoard);
  const [rev, setRev] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    const ok = await confirm({
      title: `Delete "${board.name}"?`,
      description: "The pipeline and all its stages/cards are removed. Contacts are kept.",
      confirmLabel: "Delete pipeline",
      variant: "danger",
    });
    if (!ok) return;
    setDeleting(true);
    const res = await apiFetch(`/api/pipelines/${board.id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setDeleting(false);
      alert(j?.error ?? "Failed to delete pipeline");
      return;
    }
    router.push(`/${workspaceSlug}/pipelines`);
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href={`/${workspaceSlug}/pipelines`}
            className="p-1.5 -ml-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
            title="Back to pipelines"
          >
            <ChevronLeft size={18} />
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-gray-900 truncate">{board.name}</h1>
            <p className="text-xs text-gray-400">Drag contacts between stages to track your deals.</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {canManagePipelines && (
            <button
              onClick={() => setEditOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors"
            >
              <Pencil size={14} /> Edit
            </button>
          )}
          {canDeletePipelines && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-red-600 bg-white border border-gray-200 hover:bg-red-50 hover:border-red-200 disabled:opacity-50 rounded-xl transition-colors"
            >
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete
            </button>
          )}
        </div>
      </div>

      {/* Board — constrained width, scrolls horizontally for extra stages */}
      <div className="flex-1 min-h-0 min-w-0 w-full max-w-6xl mx-auto flex flex-col overflow-hidden">
        <PipelineBoard key={`${board.id}:${rev}`} initialBoard={board} />
      </div>

      {editOpen && (
        <PipelineModal
          initial={{
            id: board.id,
            name: board.name,
            stages: board.stages.map((s) => ({ id: s.id, name: s.name, color: s.color })),
          }}
          onClose={() => setEditOpen(false)}
          onUpdated={(updated) => {
            setBoard(updated);
            setRev((r) => r + 1);
            setEditOpen(false);
          }}
        />
      )}
    </>
  );
}
