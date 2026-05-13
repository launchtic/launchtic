"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2, AlertTriangle } from "lucide-react";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function GeneralPanel({
  workspaceId,
  workspaceName,
  workspaceSlug,
}: {
  workspaceId:   string;
  workspaceName: string;
  workspaceSlug: string;
}) {
  const { update } = useSession();
  const router = useRouter();

  // ── Name ──────────────────────────────────────────────────
  const [name, setName] = useState(workspaceName);
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError]   = useState<string | null>(null);
  const [nameSuccess, setNameSuccess] = useState(false);

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || name.trim() === workspaceName) return;
    setSavingName(true); setNameError(null); setNameSuccess(false);
    const res = await fetch(`/api/workspaces/${workspaceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    const json = await res.json();
    setSavingName(false);
    if (!res.ok) { setNameError(json.error ?? "Failed to save."); return; }
    await update({ workspaceName: name.trim() });
    setNameSuccess(true);
    setTimeout(() => setNameSuccess(false), 2500);
    router.refresh();
  }

  // ── Slug ──────────────────────────────────────────────────
  const [slug, setSlug] = useState(workspaceSlug);
  const [savingSlug, setSavingSlug] = useState(false);
  const [slugError, setSlugError]   = useState<string | null>(null);
  const [slugSuccess, setSlugSuccess] = useState(false);

  function handleSlugInput(value: string) {
    // Auto-slugify as user types.
    setSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/--+/g, "-"));
    setSlugSuccess(false);
  }

  async function handleSaveSlug(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = slug.replace(/^-|-$/g, "");
    if (!trimmed || trimmed === workspaceSlug) return;
    setSavingSlug(true); setSlugError(null); setSlugSuccess(false);
    const res = await fetch(`/api/workspaces/${workspaceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: trimmed }),
    });
    const json = await res.json();
    setSavingSlug(false);
    if (!res.ok) { setSlugError(json.error ?? "Failed to save."); return; }
    // Slug changed → update session + navigate to new URL.
    await update({ workspaceSlug: trimmed });
    router.push(`/${trimmed}/settings?tab=general`);
  }

  return (
    <div className="space-y-8 max-w-xl">
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-1">General</h2>
        <p className="text-sm text-gray-500">Basic settings for your workspace.</p>
      </div>

      {/* Workspace name */}
      <section className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-800">Workspace name</h3>
        <form onSubmit={handleSaveName} className="flex gap-3">
          <input
            value={name}
            onChange={(e) => { setName(e.target.value); setNameSuccess(false); }}
            placeholder="Workspace name"
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={savingName || !name.trim() || name.trim() === workspaceName}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {savingName ? <Loader2 size={14} className="animate-spin" /> : "Save"}
          </button>
        </form>
        {nameError   && <p className="text-xs text-red-600">{nameError}</p>}
        {nameSuccess && <p className="text-xs text-green-600">Workspace name updated.</p>}
      </section>

      {/* Workspace slug */}
      <section className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-800">Workspace URL</h3>
        <form onSubmit={handleSaveSlug} className="space-y-3">
          <div className="flex items-center gap-0 border border-gray-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
            <span className="px-3 py-2 text-sm text-gray-400 bg-gray-50 border-r border-gray-200 shrink-0 select-none">
              /
            </span>
            <input
              value={slug}
              onChange={(e) => handleSlugInput(e.target.value)}
              placeholder="my-workspace"
              className="flex-1 px-3 py-2 text-sm focus:outline-none"
            />
          </div>

          {/* Warning note */}
          {slug !== workspaceSlug && slug.length > 0 && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
              <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                Changing the slug will update your workspace URL to <span className="font-mono font-medium">/{slug}</span>. Any existing bookmarks or shared links will stop working.
              </p>
            </div>
          )}

          {slugError   && <p className="text-xs text-red-600">{slugError}</p>}
          {slugSuccess && <p className="text-xs text-green-600">Workspace URL updated.</p>}

          <button
            type="submit"
            disabled={savingSlug || !slug || slug === workspaceSlug}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {savingSlug ? <><Loader2 size={14} className="animate-spin inline mr-1" />Saving…</> : "Update URL"}
          </button>
        </form>
      </section>
    </div>
  );
}
