"use client";

import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { X, Loader2, ImageOff, Search, UploadCloud, Pin } from "lucide-react";
import { apiFetch } from "../../lib/api-client";

type MediaFile = { key: string; name: string; url: string; size: number; assetId?: string | null; pinned?: boolean };

const PAGE_SIZE = 30;

// Checkerboard behind thumbnails so transparent / white logos stay visible
// against the tile instead of blending into white. Opaque photos cover it.
const CHECKERBOARD_STYLE: CSSProperties = {
  backgroundColor: "#fff",
  backgroundImage:
    "linear-gradient(45deg,#d9d9d9 25%,transparent 25%),linear-gradient(-45deg,#d9d9d9 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#d9d9d9 75%),linear-gradient(-45deg,transparent 75%,#d9d9d9 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
};

// Reusable modal to pick an existing image from the workspace Media Library
// (instead of re-uploading). Calls onSelect(url) with the chosen image's URL.
// Search is server-side (full library via the Asset table); pins are shared
// per-workspace. Both mirror the page-editor's image picker.
export default function MediaLibraryPicker({
  onSelect,
  onClose,
}: {
  onSelect: (url: string) => void;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [pinnedFiles, setPinnedFiles] = useState<MediaFile[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pinningKey, setPinningKey] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(file: File) {
    setUploading(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/media/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!json.success) { setError(json.error ?? "Upload failed"); return; }
      onSelect(json.data.url); // upload → use it immediately
      onClose();
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const load = useCallback(async (loadMore: boolean) => {
    if (loadMore) setLoadingMore(true);
    else { setLoading(true); setFiles([]); setNextToken(null); }
    setError(null);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (loadMore && nextToken) params.set("continuation_token", nextToken);
      if (search.trim()) params.set("search", search.trim());
      const res = await apiFetch(`/api/media?${params}`);
      const json = await res.json();
      if (!json.success) { setError(json.error ?? "Failed to load media"); return; }
      const d = json.data;
      setFiles((prev) => loadMore ? [...prev, ...d.files] : (d.files ?? []));
      setPinnedFiles(d.pinned ?? []);
      setHasMore(d.hasMore);
      setNextToken(d.nextToken);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false); setLoadingMore(false);
    }
  }, [nextToken, search]);

  // Initial load + debounced reload when the search query changes.
  useEffect(() => {
    const t = setTimeout(() => load(false), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const isPinned = (key: string) => pinnedFiles.some((p) => p.key === key);

  async function togglePin(f: MediaFile) {
    if (!f.assetId) return; // only Asset-tracked files can be pinned
    setPinningKey(f.key);
    try {
      const res = await fetch("/api/media/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: f.assetId, pinned: !isPinned(f.key) }),
      });
      const json = await res.json();
      if (json.success) await load(false);
      else setError(json.error ?? "Failed to update pin");
    } catch {
      setError("Failed to update pin");
    } finally {
      setPinningKey(null);
    }
  }

  // Browse mode: pinned first, then the loaded page (minus pins). Search mode:
  // the server already returns matches sorted pinned-first.
  const pinnedKeys = new Set(pinnedFiles.map((p) => p.key));
  const displayFiles = search.trim()
    ? files
    : [...pinnedFiles, ...files.filter((f) => !pinnedKeys.has(f.key))];

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
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-60 transition-colors"
            >
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <UploadCloud size={13} />}
              {uploading ? "Uploading…" : "Upload"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }}
            />
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-4 pt-3 shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by filename…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-gray-500">
              <Loader2 size={16} className="animate-spin mr-2" /> Loading…
            </div>
          ) : error ? (
            <div className="py-16 text-center text-sm text-red-600">{error}</div>
          ) : displayFiles.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400 flex flex-col items-center gap-2">
              <ImageOff size={24} className="text-gray-300" />
              {search ? "No files match" : "No images yet — upload one first."}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {displayFiles.map((f) => (
                  <div
                    key={f.key}
                    className="group relative aspect-square rounded-lg overflow-hidden border border-gray-200 hover:border-blue-400 hover:ring-2 hover:ring-blue-200 transition-colors"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={f.url}
                      alt={f.name}
                      title={f.name}
                      loading="lazy"
                      onClick={() => { onSelect(f.url); onClose(); }}
                      style={CHECKERBOARD_STYLE}
                      className="w-full h-full object-cover cursor-pointer"
                    />
                    {f.assetId && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); togglePin(f); }}
                        disabled={pinningKey === f.key}
                        title={isPinned(f.key) ? "Unpin" : "Pin to top"}
                        className={`absolute top-1.5 left-1.5 w-6 h-6 rounded-full flex items-center justify-center text-white transition-opacity ${
                          isPinned(f.key)
                            ? "bg-blue-600 opacity-100"
                            : "bg-black/45 opacity-0 group-hover:opacity-100"
                        }`}
                      >
                        {pinningKey === f.key
                          ? <Loader2 size={12} className="animate-spin" />
                          : <Pin size={12} className={isPinned(f.key) ? "fill-current" : ""} />}
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {hasMore && (
                <div className="flex justify-center pt-4">
                  <button
                    onClick={() => load(true)}
                    disabled={loadingMore}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-60 transition-colors"
                  >
                    {loadingMore && <Loader2 size={14} className="animate-spin" />}
                    Load more
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
