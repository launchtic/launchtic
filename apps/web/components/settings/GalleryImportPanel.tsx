"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Loader2, DownloadCloud, ExternalLink, CheckCircle2, XCircle,
} from "lucide-react";
import { apiFetch } from "../../lib/api-client";

const GALLERY_HOST = "launchtic.com";
const SLUG_RE = /^[a-z0-9-]+$/;

type ImportedItem = {
  kind: "page" | "email" | "funnel";
  name: string;
  id: string;
  at: number;
};

function normalizeInput(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  // Bare slug → build canonical URL
  if (SLUG_RE.test(v)) return `https://${GALLERY_HOST}/api/public-templates/${v}`;
  return v;
}

function destinationHref(workspaceSlug: string, kind: string, id: string): string {
  switch (kind) {
    case "page":   return `/${workspaceSlug}/settings/page-templates`;
    case "email":  return `/${workspaceSlug}/settings/email`;
    case "funnel": return `/${workspaceSlug}/funnels/${id}`;
    default:       return `/${workspaceSlug}`;
  }
}

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export default function GalleryImportPanel({ workspaceSlug }: { workspaceSlug: string }) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ImportedItem[]>([]);

  async function handleImport() {
    const url = normalizeInput(input);
    if (!url) return;
    setBusy(true); setError(null);
    try {
      const res = await apiFetch("/api/templates/import-from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error ?? json.data?.error ?? "Import failed");
        return;
      }
      const d = json.data;
      const item: ImportedItem = {
        kind: d.kind,
        name: d.template?.name ?? d.funnel?.name ?? "(unnamed)",
        id:   d.template?.id   ?? d.funnel?.id   ?? "",
        at:   Date.now(),
      };
      setHistory((h) => [item, ...h].slice(0, 10));
      setInput("");
    } catch (e: any) {
      setError(e?.message ?? "Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl p-6">
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-1">Import from Gallery</h2>
        <p className="text-sm text-gray-500">
          Paste a template URL from the launchtic.com gallery, or just the slug. The
          template will be imported into this workspace as a new page, email, or funnel
          based on its kind.
        </p>
      </div>

      {/* Input card */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <label htmlFor="gallery-url" className="block text-xs font-medium text-gray-600">
          Gallery URL or slug
        </label>
        <input
          id="gallery-url"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !busy && input.trim()) handleImport(); }}
          placeholder={`https://${GALLERY_HOST}/api/public-templates/your-slug   —or—   your-slug`}
          disabled={busy}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
        />
        {error && (
          <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">
            <XCircle size={14} className="mt-0.5 shrink-0" />
            <span className="break-all">{error}</span>
          </div>
        )}
        <div className="flex justify-end">
          <button
            onClick={handleImport}
            disabled={busy || !input.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {busy
              ? <><Loader2 size={14} className="animate-spin" />Importing…</>
              : <><DownloadCloud size={14} />Import to workspace</>}
          </button>
        </div>
      </div>

      {/* Recent imports (session-only — not persisted) */}
      {history.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider px-1">
            Recent imports
          </p>
          <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
            {history.map((item, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3 gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 size={14} className="text-green-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                    <p className="text-xs text-gray-400">
                      {item.kind} · {timeAgo(item.at)}
                    </p>
                  </div>
                </div>
                <Link
                  href={destinationHref(workspaceSlug, item.kind, item.id)}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 shrink-0"
                >
                  Open <ExternalLink size={11} />
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
