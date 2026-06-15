"use client";

import { useEffect, useState } from "react";
import { X, Loader2, ImageOff } from "lucide-react";
import { apiFetch } from "../../lib/api-client";

type MediaFile = { key: string; name: string; url: string; size: number };

// Reusable modal to pick an existing image from the workspace Media Library
// (instead of re-uploading). Calls onSelect(url) with the chosen image's URL.
export default function MediaLibraryPicker({
  onSelect,
  onClose,
}: {
  onSelect: (url: string) => void;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [folder, setFolder] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ limit: "60" });
    if (folder) params.set("folder", folder);
    apiFetch(`/api/media?${params}`)
      .then((r) => r.json())
      .then((r) => {
        if (cancelled) return;
        if (!r.success) { setError(r.error ?? "Failed to load media"); return; }
        setFiles(r.data.files ?? []);
        if (Array.isArray(r.data.folders)) setFolders(r.data.folders);
      })
      .catch(() => { if (!cancelled) setError("Network error"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [folder]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-gray-200 shrink-0">
          <h2 className="text-sm font-semibold text-gray-900">Media Library</h2>
          <div className="flex items-center gap-2">
            {folders.length > 0 && (
              <select
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All folders</option>
                {folders.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            )}
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-gray-500">
              <Loader2 size={16} className="animate-spin mr-2" /> Loading…
            </div>
          ) : error ? (
            <div className="py-16 text-center text-sm text-red-600">{error}</div>
          ) : files.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400 flex flex-col items-center gap-2">
              <ImageOff size={24} className="text-gray-300" />
              No images yet — upload one first.
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {files.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => { onSelect(f.url); onClose(); }}
                  title={f.name}
                  className="group relative aspect-square rounded-lg overflow-hidden border border-gray-200 hover:border-blue-400 hover:ring-2 hover:ring-blue-200 transition-colors"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={f.name} loading="lazy" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
