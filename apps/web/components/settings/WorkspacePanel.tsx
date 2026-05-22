"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2, Plus, Pencil, Trash2, Check, X, Building2, Copy } from "lucide-react";
import { apiFetch } from "../../lib/api-client";
import { isAgencyPlan } from "../../lib/plan";
import { useRole } from "../../lib/role";

type Workspace = { id: string; name: string; slug: string; ownerId: string; userRole: string };

export default function WorkspacePanel({
  currentWorkspaceId,
  currentWorkspaceSlug,
  workspacePlan,
  userId,
  workspaces: initialWorkspaces,
}: {
  currentWorkspaceId: string;
  currentWorkspaceSlug: string;
  workspacePlan: string;
  userId: string;
  workspaces: Workspace[];
}) {
  const { update } = useSession();
  const router = useRouter();
  const { canManageWorkspace } = useRole();
  const isPro = isAgencyPlan(workspacePlan);

  const [items, setItems] = useState<Workspace[]>(initialWorkspaces);
  const [activeId, setActiveId] = useState(currentWorkspaceId);

  // ── Switch ─────────────────────────────────────────────────
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  async function handleSwitch(ws: Workspace) {
    if (ws.id === activeId) return;
    setSwitchingId(ws.id);
    // No session.update — workspace context now comes from URL (header for APIs,
    // params for server components). Just navigate; the new dashboard layout
    // re-fetches role/plan/etc for the target workspace.
    setActiveId(ws.id);
    setSwitchingId(null);
    router.push(`/${ws.slug}/dashboard`);
  }

  // ── Create ─────────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setCreateError(null);
    const res = await apiFetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    const json = await res.json();
    setCreating(false);
    if (!res.ok) { setCreateError(json.error ?? "Failed to create"); return; }
    const ws = { ...json.data, ownerId: userId } as Workspace;
    setItems((prev) => [...prev, ws]);
    setShowCreate(false);
    setNewName("");
  }

  // ── Rename ─────────────────────────────────────────────────
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  function startRename(ws: Workspace) {
    setRenamingId(ws.id);
    setRenameValue(ws.name);
    setRenameError(null);
  }

  async function saveRename(ws: Workspace) {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === ws.name) { setRenamingId(null); return; }
    setRenameSaving(true);
    setRenameError(null);
    const res = await apiFetch(`/api/workspaces/${ws.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    const json = await res.json();
    setRenameSaving(false);
    if (!res.ok) { setRenameError(json.error ?? "Failed to rename"); return; }
    setItems((prev) => prev.map((w) => w.id === ws.id ? { ...w, name: trimmed } : w));
    if (ws.id === activeId) {
      await update({ workspaceName: trimmed });
      router.refresh();
    }
    setRenamingId(null);
  }

  // ── Clone ──────────────────────────────────────────────────
  type CloneInclude = {
    funnels:        boolean;
    emailTemplates: boolean;
    sequences:      boolean;
    automations:    boolean;
    pageTemplates:  boolean;
    roles:          boolean;
    settings:       boolean;
  };
  const DEFAULT_INCLUDE: CloneInclude = {
    funnels: true, emailTemplates: true, sequences: true,
    automations: true, pageTemplates: true, roles: true,
    // Default OFF — credentials are sensitive; user opts in.
    settings: false,
  };
  const [cloneSource, setCloneSource] = useState<Workspace | null>(null);
  const [cloneName, setCloneName] = useState("");
  const [cloneInclude, setCloneInclude] = useState<CloneInclude>(DEFAULT_INCLUDE);
  const [cloning, setCloning] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);

  function startClone(ws: Workspace) {
    setCloneSource(ws);
    setCloneName(`${ws.name} (Copy)`);
    setCloneInclude(DEFAULT_INCLUDE);
    setCloneError(null);
  }

  function toggleInclude(key: keyof CloneInclude, next: boolean) {
    setCloneInclude((prev) => ({ ...prev, [key]: next }));
  }

  async function handleClone(e: React.FormEvent) {
    e.preventDefault();
    if (!cloneSource || !cloneName.trim()) return;
    setCloning(true);
    setCloneError(null);
    const res = await apiFetch(`/api/workspaces/${cloneSource.id}/clone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: cloneName.trim(), include: cloneInclude }),
    });
    const json = await res.json();
    setCloning(false);
    if (!res.ok) { setCloneError(json.error ?? "Failed to clone"); return; }
    const ws = { ...json.data, ownerId: userId, userRole: "OWNER" } as Workspace;
    setItems((prev) => [...prev, ws]);
    setCloneSource(null);
  }

  // ── Delete ─────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<Workspace | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    if (!deleteTarget || deleteConfirm !== deleteTarget.name) return;
    setDeleting(true);
    setDeleteError(null);
    const res = await apiFetch(`/api/workspaces/${deleteTarget.id}`, { method: "DELETE" });
    const json = await res.json();
    setDeleting(false);
    if (!res.ok) { setDeleteError(json.error ?? "Failed to delete"); return; }
    const remaining = items.filter((w) => w.id !== deleteTarget.id);
    setItems(remaining);
    setDeleteTarget(null);
    setDeleteConfirm("");
    // If the active workspace was deleted, navigate to the first remaining one.
    if (deleteTarget.id === activeId && remaining.length > 0) {
      const next = remaining[0];
      await update({ workspaceId: next.id, workspaceSlug: next.slug, workspaceName: next.name });
      router.push(`/${next.slug}/dashboard`);
    }
  }

  const ownedCount = items.filter((w) => w.ownerId === userId).length;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-1">Workspaces</h2>
          <p className="text-sm text-gray-500">Manage and switch between your workspaces.</p>
        </div>
        {isPro && canManageWorkspace && (
          <button
            onClick={() => { setShowCreate(true); setCreateError(null); setNewName(""); }}
            className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
          >
            <Plus size={14} />
            New workspace
          </button>
        )}
      </div>

      {/* Workspace list */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {items.map((ws, i) => {
          const isActive   = ws.id === activeId;
          const isOwner    = ws.ownerId === userId;
          const isLast     = isOwner && ownedCount <= 1;
          const isRenaming = renamingId === ws.id;

          return (
            <div
              key={ws.id}
              className={`flex items-center gap-3 px-5 py-4 ${i > 0 ? "border-t border-gray-100" : ""}`}
            >
              {/* Icon */}
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isActive ? "bg-blue-100" : "bg-gray-100"}`}>
                <Building2 size={14} className={isActive ? "text-blue-600" : "text-gray-400"} />
              </div>

              {/* Name / inline rename */}
              <div className="flex-1 min-w-0">
                {isRenaming ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveRename(ws);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      className="flex-1 px-2 py-1 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {renameSaving
                      ? <Loader2 size={14} className="animate-spin text-gray-400 ml-1" />
                      : <>
                          <button onClick={() => saveRename(ws)} className="p-1 text-green-600 hover:bg-green-50 rounded-lg transition-colors">
                            <Check size={14} />
                          </button>
                          <button onClick={() => setRenamingId(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors">
                            <X size={14} />
                          </button>
                        </>
                    }
                  </div>
                ) : (
                  <p className="text-sm font-medium text-gray-900 truncate">{ws.name}</p>
                )}
                {renameError && renamingId === null && (
                  <p className="text-xs text-red-600 mt-0.5">{renameError}</p>
                )}
                <p className="text-xs text-gray-400 mt-0.5">{isOwner ? "Owner" : "Member"}</p>
              </div>

              {/* Active badge */}
              {isActive && (
                <span className="shrink-0 text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                  Active
                </span>
              )}

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                {!isActive && (
                  <button
                    onClick={() => handleSwitch(ws)}
                    disabled={switchingId === ws.id}
                    className="px-2.5 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    {switchingId === ws.id ? <Loader2 size={12} className="animate-spin" /> : "Switch"}
                  </button>
                )}
                {isOwner && !isRenaming && (
                  <button
                    onClick={() => startRename(ws)}
                    className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <Pencil size={13} />
                  </button>
                )}
                {isOwner && isPro && (
                  <button
                    onClick={() => startClone(ws)}
                    title="Clone this workspace"
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <Copy size={13} />
                  </button>
                )}
                {isOwner && (
                  <button
                    onClick={() => { setDeleteTarget(ws); setDeleteConfirm(""); setDeleteError(null); }}
                    disabled={isLast}
                    title={isLast ? "Cannot delete your only workspace" : undefined}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
          onClick={() => { setShowCreate(false); setCreateError(null); }}
        >
          <div
            className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold text-gray-900 mb-4">New workspace</h2>
            {createError && (
              <p className="mb-3 text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{createError}</p>
            )}
            <form onSubmit={handleCreate} className="space-y-3">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Workspace name"
                required
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); setCreateError(null); setNewName(""); }}
                  className="flex-1 px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newName.trim()}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-50 transition-colors"
                >
                  {creating ? <><Loader2 size={13} className="animate-spin" /> Creating…</> : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
          onClick={() => { setDeleteTarget(null); setDeleteConfirm(""); setDeleteError(null); }}
        >
          <div
            className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <Trash2 size={16} className="text-red-600" />
              </div>
              <h2 className="text-sm font-semibold text-gray-900">Delete workspace</h2>
            </div>
            <p className="text-sm text-gray-500 mb-1">
              This will permanently delete{" "}
              <span className="font-medium text-gray-800">{deleteTarget.name}</span> and all its data.
            </p>
            <p className="text-sm text-gray-500 mb-4">
              Type <span className="font-mono font-medium text-gray-800">{deleteTarget.name}</span> to confirm.
            </p>
            {deleteError && (
              <p className="mb-3 text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{deleteError}</p>
            )}
            <form onSubmit={handleDelete} className="space-y-3">
              <input
                autoFocus
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={deleteTarget.name}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-400"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setDeleteTarget(null); setDeleteConfirm(""); setDeleteError(null); }}
                  className="flex-1 px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={deleting || deleteConfirm !== deleteTarget.name}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl disabled:opacity-50 transition-colors"
                >
                  {deleting ? <><Loader2 size={13} className="animate-spin" /> Deleting…</> : "Delete workspace"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Clone modal */}
      {cloneSource && (() => {
        const CLONE_GROUPS: { label: string; items: { key: keyof CloneInclude; label: string; hint: string }[] }[] = [
          {
            label: "Pages & Content",
            items: [
              { key: "funnels",       label: "Funnels",        hint: "Pages, steps, layout (pricing, bumps, and product links are not carried over)" },
              { key: "pageTemplates", label: "Page templates", hint: "Templates and saved blocks" },
            ],
          },
          {
            label: "Marketing",
            items: [
              { key: "emailTemplates", label: "Email templates", hint: "Reusable email designs" },
              { key: "sequences",      label: "Email sequences", hint: "Drip campaigns with their step content" },
              { key: "automations",    label: "Automations",     hint: "Triggers + actions — cloned as drafts for review" },
            ],
          },
          {
            label: "Team",
            items: [
              { key: "roles", label: "Roles", hint: "Custom permission presets" },
            ],
          },
        ];
        const TOP_LEVEL_KEYS: (keyof CloneInclude)[] = CLONE_GROUPS.flatMap((g) => g.items.map((i) => i.key));
        const selectedCount = TOP_LEVEL_KEYS.reduce((n, k) => n + (cloneInclude[k] ? 1 : 0), 0);
        const totalCount    = TOP_LEVEL_KEYS.length;

        function selectAll() {
          setCloneInclude((prev) => {
            const out = { ...prev };
            for (const k of TOP_LEVEL_KEYS) (out as any)[k] = true;
            return out;
          });
        }
        function selectNone() {
          setCloneInclude((prev) => {
            const out = { ...prev };
            for (const k of TOP_LEVEL_KEYS) (out as any)[k] = false;
            return out;
          });
        }

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4"
            onClick={() => setCloneSource(null)}
          >
            <div
              className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-gray-200 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                    <Copy size={16} className="text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-gray-900">Clone workspace</h2>
                    <p className="text-xs text-gray-500 truncate">
                      Duplicate <span className="font-medium text-gray-800">{cloneSource.name}</span>
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setCloneSource(null)}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded-lg transition-colors shrink-0"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleClone} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                {cloneError && (
                  <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{cloneError}</p>
                )}

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">New workspace name</label>
                  <input
                    autoFocus
                    value={cloneName}
                    onChange={(e) => setCloneName(e.target.value)}
                    required
                    maxLength={100}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <div className="flex items-baseline justify-between mb-2">
                    <label className="block text-xs font-medium text-gray-700">What to clone</label>
                    <span className="text-[11px] text-gray-500 tabular-nums">
                      {selectedCount} / {totalCount} selected
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 mb-2">
                    <span className="text-[11px] text-gray-500 mr-1">Presets:</span>
                    <button
                      type="button"
                      onClick={selectAll}
                      className="text-[11px] font-medium px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={selectNone}
                      className="text-[11px] font-medium px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                    >
                      Clear all
                    </button>
                  </div>

                  <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
                    {CLONE_GROUPS.map((group) => {
                      const groupSelected = group.items.filter((i) => cloneInclude[i.key]).length;
                      const allInGroup    = groupSelected === group.items.length;
                      const badgeColor    = groupSelected === 0
                        ? "text-gray-400 bg-gray-100"
                        : allInGroup
                          ? "text-blue-700 bg-blue-100"
                          : "text-blue-600 bg-blue-50";
                      return (
                        <div key={group.label}>
                          <div className="flex items-center gap-2 px-3 py-2 bg-gray-50/40">
                            <span className="text-[11px] font-semibold text-gray-700 uppercase tracking-wider">
                              {group.label}
                            </span>
                            <span className={`text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded ${badgeColor}`}>
                              {groupSelected}/{group.items.length}
                            </span>
                          </div>
                          <div className="px-3 py-2 space-y-1">
                            {group.items.map(({ key, label, hint }) => (
                              <label key={key} className="flex items-start gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={cloneInclude[key]}
                                  onChange={(e) => toggleInclude(key, e.target.checked)}
                                  className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <div className="flex-1 min-w-0">
                                  <span className="text-sm text-gray-900">{label}</span>
                                  <p className="text-xs text-gray-500">{hint}</p>
                                </div>
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}

                    {/* Sensitive: credentials — separated with amber accent */}
                    <div>
                      <div className="flex items-center gap-2 px-3 py-2 bg-amber-50/40">
                        <span className="text-[11px] font-semibold text-gray-700 uppercase tracking-wider">
                          Sensitive
                        </span>
                        <span className="text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded text-amber-700 bg-amber-100">
                          {cloneInclude.settings ? "1/1" : "0/1"}
                        </span>
                      </div>
                      <div className="px-3 py-2">
                        <label className="flex items-start gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={cloneInclude.settings}
                            onChange={(e) => toggleInclude("settings", e.target.checked)}
                            className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm text-gray-900">Settings &amp; credentials</span>
                              <span className="text-[10px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">sensitive</span>
                            </div>
                            <p className="text-xs text-gray-500">SMTP, AI key, S3, Stripe, PayPal, email footer — copies all credentials to the new workspace</p>
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>

                  <p className="text-[11px] text-gray-400 mt-2 leading-snug">
                    Products, tags, contacts, orders and send history are never cloned. Cloned automations come over as drafts — review and rewire them before activating. Uploaded images stay hosted by the source workspace, so deleting it will break them in the clone.
                  </p>
                </div>
              </form>

              <div className="flex gap-2 px-6 py-4 border-t border-gray-200 shrink-0">
                <button
                  type="button"
                  onClick={() => setCloneSource(null)}
                  className="flex-1 px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  onClick={handleClone}
                  disabled={cloning || !cloneName.trim()}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-50 transition-colors"
                >
                  {cloning
                    ? <><Loader2 size={13} className="animate-spin" /> Cloning…</>
                    : <><Check size={13} /> Clone workspace</>
                  }
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
