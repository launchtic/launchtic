"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Loader2, ImageOff, Search } from "lucide-react";
import { apiFetch } from "../../lib/api-client";

type MediaFile = { key: string; name: string; url: string; size: number };

const PAGE_SIZE = 30;

// Reusable modal to pick an existing image from the workspace Media Library
// (instead of re-uploading). Calls onSelect(url) with the chosen image's URL.
// Mirrors /settings/media: paginated "Load more" + client-side name search
// over the loaded pages.
export default function MediaLibraryPicker({
  onSelect,
  onClose,
}: {
  onSelect: (url: string) => void;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (loadMore: boolean) => {
    if (loadMore) setLoadingMore(true);
    else { setLoading(true); setFiles([]); setNextToken(null); }
    setError(null);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (loadMore && nextToken) params.set("continuation_token", nextToken);
      const res = await apiFetch(`/api/media?${params}`);
      const json = await res.json();
      if (!json.success) { setError(json.error ?? "Failed to load media"); return; }
      const d = json.data;
      setFiles((prev) => loadMore ? [...prev, ...d.files] : (d.files ?? []));
      setHasMore(d.hasMore);
      setNextToken(d.nextToken);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false); setLoadingMore(false);
    }
  }, [nextToken]);

  useEffect(() => { load(false); /* eslint-disable-next-line */ }, []);

  const filtered = search.trim()
    ? files.filter((f) => f.name.toLowerCase().includes(search.trim().toLowerCase()))
    : files;

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
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={16} />
          </button>
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
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400 flex flex-col items-center gap-2">
              <ImageOff size={24} className="text-gray-300" />
              {search ? "No files match" : "No images yet — upload one first."}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {filtered.map((f) => (
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
