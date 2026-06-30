"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { KanbanSquare, Plus, Trash2, Users, Layers, Loader2 } from "lucide-react";
import { useConfirm } from "../ui/ConfirmDialog";
import { useRole } from "../../lib/role";
import { apiFetch } from "../../lib/api-client";
import PipelineModal from "./PipelineModal";

type Item = {
  id: string;
  name: string;
  stageCount: number;
  contactCount: number;
  createdAt: string;
};

export default function PipelinesListClient({ items }: { items: Item[] }) {
  const router = useRouter();
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const { canManagePipelines, canDeletePipelines } = useRole();
  const confirm = useConfirm();

  const [createOpen, setCreateOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleDelete(item: Item) {
    const ok = await confirm({
      title: `Delete "${item.name}"?`,
      description: "The pipeline and all its stages/cards are removed. Contacts are kept.",
      confirmLabel: "Delete pipeline",
      variant: "danger",
    });
    if (!ok) return;
    setBusyId(item.id);
    const res = await apiFetch(`/api/pipelines/${item.id}`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j?.error ?? "Failed to delete pipeline");
      return;
    }
    router.refresh();
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Pipelines</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {items.length} {items.length === 1 ? "pipeline" : "pipelines"}
          </p>
        </div>
        {canManagePipelines && (
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors shrink-0"
          >
            <Plus size={16} /> New Pipeline
          </button>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-4 sm:px-6 pb-4">
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mb-3">
                <KanbanSquare size={20} className="text-blue-500" />
              </div>
              <p className="text-sm font-medium text-gray-700 mb-1">No pipelines yet</p>
              <p className="text-xs text-gray-400">Create your first pipeline to start tracking deals</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="text-left px-6 py-3 font-semibold">Name</th>
                    <th className="text-left px-4 py-3 font-semibold">Stages</th>
                    <th className="text-left px-4 py-3 font-semibold">Contacts</th>
                    <th className="text-left px-4 py-3 font-semibold">Created</th>
                    <th className="text-right px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {items.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors group">
                      <td className="px-6 py-3">
                        <Link href={`/${workspaceSlug}/pipelines/${p.id}`} className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                            <KanbanSquare size={15} className="text-blue-500" />
                          </div>
                          <span className="font-medium text-gray-900 group-hover:text-blue-700 transition-colors truncate">
                            {p.name}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        <span className="inline-flex items-center gap-1"><Layers size={12} /> {p.stageCount}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        <span className="inline-flex items-center gap-1"><Users size={12} /> {p.contactCount}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {new Date(p.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {canDeletePipelines && (
                            <button
                              onClick={() => handleDelete(p)}
                              disabled={busyId === p.id}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete pipeline"
                            >
                              {busyId === p.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {createOpen && (
        <PipelineModal
          onClose={() => setCreateOpen(false)}
          onCreated={(meta) => {
            setCreateOpen(false);
            router.push(`/${workspaceSlug}/pipelines/${meta.id}`);
          }}
        />
      )}
    </>
  );
}
