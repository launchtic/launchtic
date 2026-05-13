"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ChevronDown, Plus, Building2, Loader2 } from "lucide-react";

type Workspace = { id: string; name: string; slug: string };

export default function WorkspaceSwitcher({
  currentSlug,
  currentName,
  workspaces,
}: {
  currentSlug: string;
  currentName: string;
  workspaces: Workspace[];
}) {
  const { update } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  async function handleSwitch(ws: Workspace) {
    if (ws.slug === currentSlug) { setOpen(false); return; }
    setOpen(false);
    await update({ workspaceId: ws.id, workspaceSlug: ws.slug, workspaceName: ws.name });
    router.push(`/${ws.slug}/dashboard`);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    const res = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    const json = await res.json();
    setCreating(false);
    if (!res.ok) { setError(json.error ?? "Failed to create"); return; }
    const ws = json.data as Workspace;
    await update({ workspaceId: ws.id, workspaceSlug: ws.slug, workspaceName: ws.name });
    setShowCreate(false);
    setNewName("");
    router.push(`/${ws.slug}/dashboard`);
  }

  return (
    <>
      <div ref={ref} className="relative shrink-0">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors max-w-[200px]"
        >
          <Building2 size={14} className="shrink-0 text-gray-400" />
          <span className="truncate">{currentName}</span>
          <ChevronDown size={12} className={`shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div className="absolute left-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-50">
            <p className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
              Workspaces
            </p>
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => handleSwitch(ws)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors"
              >
                <span className="truncate text-gray-700">{ws.name}</span>
                {ws.slug === currentSlug && (
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0 ml-2" />
                )}
              </button>
            ))}
            <div className="border-t border-gray-100 mt-1 pt-1">
              <button
                onClick={() => { setOpen(false); setShowCreate(true); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 transition-colors"
              >
                <Plus size={13} />
                New workspace
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create workspace modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
          onClick={() => { setShowCreate(false); setError(null); }}
        >
          <div
            className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold text-gray-900 mb-4">New workspace</h2>
            {error && (
              <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
                {error}
              </div>
            )}
            <form onSubmit={handleCreate} className="space-y-4">
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
                  onClick={() => { setShowCreate(false); setError(null); setNewName(""); }}
                  className="flex-1 px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newName.trim()}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-60 transition-colors"
                >
                  {creating ? <><Loader2 size={13} className="animate-spin" /> Creating…</> : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
