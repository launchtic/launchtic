"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Upload, Trash2, Loader2, Image as ImageIcon,
  Search, Copy, Check, X,
} from "lucide-react";
import { apiFetch } from "../../lib/api-client";
import { useConfirm } from "../ui/ConfirmDialog";

type MediaFile = {
  key:           string;
  name:          string;
  url:           string;
  thumbUrl?:     string | null;
  size:          number;
  lastModified?: string;
  assetId?:      string | null;
};

const PAGE_SIZE = 30;

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function MediaLibraryPanel() {
  const confirm = useConfirm();
  const [files, setFiles]           = useState<MediaFile[]>([]);
  const [search, setSearch]         = useState("");
  const [loading, setLoading]       = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore]       = useState(false);
  const [nextToken, setNextToken]   = useState<string | null>(null);
  const [total, setTotal]           = useState(0);
  const [uploading, setUploading]   = useState(false);
  const [deleting, setDeleting]     = useState<string | null>(null);
  const [copied, setCopied]         = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (loadMore: boolean) => {
    if (loadMore) setLoadingMore(true);
    else { setLoading(true); setFiles([]); setNextToken(null); }
    setError(null);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (loadMore && nextToken) params.set("continuation_token", nextToken);
      const res  = await apiFetch(`/api/media?${params}`);
      const json = await res.json();
      if (!json.success) { setError(json.error ?? "Failed to load"); return; }
      const d = json.data;
      setFiles((prev) => loadMore ? [...prev, ...d.files] : d.files);
      setHasMore(d.hasMore);
      setNextToken(d.nextToken);
      setTotal(d.total);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false); setLoadingMore(false);
    }
  }, [nextToken]);

  useEffect(() => { load(false); /* eslint-disable-next-line */ }, []);

  async function handleUpload(file: File) {
    setUploading(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res  = await fetch("/api/media/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!json.success) { setError(json.error ?? "Upload failed"); return; }
      await load(false);
    } catch (e: any) {
      setError(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(file: MediaFile) {
    const ok = await confirm({
      title: "Delete file?",
      description: `"${file.name}" will be removed from storage. Any pages or emails still referencing it will show broken images.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    setDeleting(file.key); setError(null);
    try {
      const res  = await apiFetch("/api/media/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: file.key }),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error ?? "Delete failed"); return; }
      setFiles((prev) => prev.filter((f) => f.key !== file.key));
      setTotal((t) => Math.max(0, t - 1));
    } catch (e: any) {
      setError(e?.message ?? "Delete failed");
    } finally {
      setDeleting(null);
    }
  }

  function handleCopyUrl(file: MediaFile) {
    navigator.clipboard.writeText(file.url);
    setCopied(file.key);
    setTimeout(() => setCopied((c) => (c === file.key ? null : c)), 1500);
  }

  const filtered = search.trim()
    ? files.filter((f) => f.name.toLowerCase().includes(search.trim().toLowerCase()))
    : files;

  return (
    <div className="max-w-6xl space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-0.5">Media Library</h2>
          <p className="text-sm text-gray-500">
            All assets uploaded to this workspace. {total > 0 && `${total} file${total !== 1 ? "s" : ""}.`}
          </p>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 px-3.5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          Upload
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) { handleUpload(f); e.target.value = ""; }
          }}
        />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-md">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by filename…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 px-3 py-2 bg-red-50 text-red-600 text-xs rounded-lg">
          <X size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="py-16 flex flex-col items-center text-gray-400">
          <Loader2 size={24} className="animate-spin mb-2" />
          <p className="text-sm">Loading…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 flex flex-col items-center text-gray-400 border border-dashed border-gray-200 rounded-xl">
          <ImageIcon size={32} className="mb-2" />
          <p className="text-sm">{search ? "No files match" : "No files yet"}</p>
          {!search && <p className="text-xs mt-1">Upload an image to get started.</p>}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filtered.map((file) => (
            <MediaCard
              key={file.key}
              file={file}
              busy={deleting === file.key}
              copied={copied === file.key}
              onCopy={() => handleCopyUrl(file)}
              onDelete={() => handleDelete(file)}
            />
          ))}
        </div>
      )}

      {hasMore && !loading && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => load(true)}
            disabled={loadingMore}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {loadingMore ? <Loader2 size={13} className="animate-spin" /> : null}
            Load more
          </button>
        </div>
      )}
    </div>
  );
}

function MediaCard({
  file, busy, copied, onCopy, onDelete,
}: {
  file: MediaFile;
  busy: boolean;
  copied: boolean;
  onCopy: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group relative bg-white border border-gray-200 rounded-xl overflow-hidden hover:border-gray-300 hover:shadow-sm transition-all">
      <div className="aspect-square bg-gray-50 relative overflow-hidden flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={file.thumbUrl || file.url}
          alt={file.name}
          className="w-full h-full object-cover"
          loading="lazy"
          decoding="async"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70">
            <Loader2 size={20} className="animate-spin text-gray-500" />
          </div>
        )}
        {/* Hover actions */}
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onCopy}
            title={copied ? "Copied!" : "Copy URL"}
            className="w-7 h-7 rounded-md bg-white/95 border border-gray-200 text-gray-600 hover:text-gray-900 flex items-center justify-center"
          >
            {copied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
          </button>
          <button
            onClick={onDelete}
            title="Delete"
            disabled={busy}
            className="w-7 h-7 rounded-md bg-white/95 border border-gray-200 text-gray-600 hover:text-red-600 flex items-center justify-center disabled:opacity-50"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      <div className="px-2.5 py-2">
        <p className="text-xs font-medium text-gray-900 truncate" title={file.name}>{file.name}</p>
        <p className="text-[10px] text-gray-400 mt-0.5">
          {fmtBytes(file.size)} · {fmtDate(file.lastModified)}
        </p>
      </div>
    </div>
  );
}
