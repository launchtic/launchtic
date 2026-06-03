"use client";

// Listing + delete UI for a workflow's emails. Each row: subject preview,
// usage count (how many SEND_EMAIL nodes reference it), engagement stats,
// edit link, delete button. Delete confirm warns when usage > 0 since the
// referencing nodes will surface a "Linked email no longer exists"
// validation error after the delete lands.

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Mail, Plus, Pencil, Trash2, Loader2, X, AlertTriangle } from "lucide-react";
import { apiFetch } from "../../lib/api-client";
import { useToast } from "../ui/Toast";

type EmailRow = {
  id:           string;
  subject:      string;
  fromName:     string;
  fromEmail:    string;
  sentCount:    number;
  openedCount:  number;
  clickedCount: number;
  createdAt:    string;
  usageCount:   number;
};

export default function WorkflowEmailList({
  workspaceSlug, workflow, emails: initial,
}: {
  workspaceSlug: string;
  workflow:      { id: string; name: string };
  emails:        EmailRow[];
}) {
  const toast = useToast();

  // Local mirror so we can drop a row on delete without a server round-trip.
  // (The page is a Server Component — a router.refresh() would also work
  // but feels heavier for one delete.)
  const [rows, setRows] = useState(initial);
  const [pendingDelete, setPendingDelete] = useState<EmailRow | null>(null);
  const [busy, setBusy] = useState(false);

  function editUrl(id: string) {
    return `/${workspaceSlug}/workflows/${workflow.id}/emails/${id}/edit`;
  }
  const newUrl = `/${workspaceSlug}/workflows/${workflow.id}/emails/new`;

  async function onConfirmDelete() {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      const res = await apiFetch(
        `/api/workflows/${workflow.id}/emails/${pendingDelete.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }
      setRows((prev) => prev.filter((r) => r.id !== pendingDelete.id));
      toast.success("Email deleted.");
    } catch {
      toast.error("Couldn't delete email.");
    } finally {
      setBusy(false);
      setPendingDelete(null);
    }
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Top bar — mirrors the email editor's top bar shape. */}
      <div className="border-b border-gray-200 bg-white px-4 py-2.5 flex items-center gap-3 shrink-0">
        <Link
          href={`/${workspaceSlug}/workflows/${workflow.id}`}
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 shrink-0"
        >
          <ArrowLeft size={14} />
          <span>{workflow.name}</span>
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-sm font-semibold text-gray-900 flex-1 min-w-0">Emails</h1>
        <Link
          href={newUrl}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
        >
          <Plus size={12} />
          New email
        </Link>
      </div>

      {/* List body */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-5 py-6">
          {rows.length === 0 ? (
            <EmptyState newUrl={newUrl} />
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr className="text-[10px] uppercase font-semibold tracking-wider text-gray-500">
                    <th className="text-left  px-4 py-2.5">Email</th>
                    <th className="text-left  px-4 py-2.5">Usage</th>
                    <th className="text-right px-4 py-2.5">Sent</th>
                    <th className="text-right px-4 py-2.5">Opened</th>
                    <th className="text-right px-4 py-2.5">Clicked</th>
                    <th className="text-right px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((r) => (
                    <Row
                      key={r.id}
                      row={r}
                      editHref={editUrl(r.id)}
                      onDelete={() => setPendingDelete(r)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {pendingDelete && (
        <DeleteConfirmModal
          email={pendingDelete}
          busy={busy}
          onConfirm={onConfirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

function Row({ row, editHref, onDelete }: { row: EmailRow; editHref: string; onDelete: () => void }) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 max-w-0">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
            <Mail size={14} className="text-blue-600" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-gray-900 truncate">
              {row.subject || <span className="italic text-gray-400">No subject</span>}
            </div>
            <div className="text-[11px] text-gray-500 truncate">
              {row.fromName
                ? `${row.fromName} <${row.fromEmail}>`
                : <span className="italic">No sender</span>}
            </div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        {row.usageCount > 0 ? (
          <span className="text-[11px] font-medium text-gray-700">
            {row.usageCount} {row.usageCount === 1 ? "step" : "steps"}
          </span>
        ) : (
          <span className="text-[11px] font-medium text-amber-600">Unused</span>
        )}
      </td>
      <td className="px-4 py-3 text-right text-xs text-gray-600 tabular-nums">{row.sentCount}</td>
      <td className="px-4 py-3 text-right text-xs text-gray-600 tabular-nums">{row.openedCount}</td>
      <td className="px-4 py-3 text-right text-xs text-gray-600 tabular-nums">{row.clickedCount}</td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <div className="flex items-center justify-end gap-1">
          <Link
            href={editHref}
            className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded"
            title="Edit"
          >
            <Pencil size={13} />
          </Link>
          <button
            onClick={onDelete}
            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
            title="Delete"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function EmptyState({ newUrl }: { newUrl: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
      <div className="w-12 h-12 mx-auto rounded-xl bg-blue-50 flex items-center justify-center mb-3">
        <Mail size={20} className="text-blue-600" />
      </div>
      <h2 className="text-sm font-semibold text-gray-900 mb-1">No emails yet</h2>
      <p className="text-xs text-gray-500 mb-4 max-w-sm mx-auto">
        Workflow emails are reusable across Send email steps in this workflow. Create one to get started.
      </p>
      <Link
        href={newUrl}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
      >
        <Plus size={12} />
        New email
      </Link>
    </div>
  );
}

function DeleteConfirmModal({
  email, busy, onConfirm, onCancel,
}: {
  email:      EmailRow;
  busy:       boolean;
  onConfirm:  () => void;
  onCancel:   () => void;
}) {
  const inUse = email.usageCount > 0;
  return (
    <div onClick={onCancel} className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
              <Trash2 size={14} className="text-red-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Delete email?</h2>
          </div>
          <button onClick={onCancel} className="p-1 text-gray-400 hover:bg-gray-100 rounded" title="Close">
            <X size={14} />
          </button>
        </div>

        <div className="px-4 py-4 space-y-3 text-sm">
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            <div className="text-xs font-medium text-gray-900 truncate">
              {email.subject || <span className="italic text-gray-400">No subject</span>}
            </div>
            <div className="text-[11px] text-gray-500 truncate">
              From: {email.fromName || <span className="italic">No sender</span>}
            </div>
          </div>

          {inUse && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                Used by <strong>{email.usageCount}</strong>{" "}
                {email.usageCount === 1 ? "Send email step" : "Send email steps"} in this workflow.
                After delete, {email.usageCount === 1 ? "that step" : "those steps"} will show a
                "Linked email no longer exists" validation error until you pick another email.
              </div>
            </div>
          )}

          <p className="text-[12px] text-gray-500">
            Historical sends keep their content snapshot — past EmailSend rows are not affected.
            This action can't be undone.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-100 bg-gray-50">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 rounded-lg disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50"
          >
            {busy && <Loader2 size={12} className="animate-spin" />}
            Delete email
          </button>
        </div>
      </div>
    </div>
  );
}
