"use client";

import { useRef, useState } from "react";
import { UploadCloud, Loader2, CheckCircle2, XCircle, FileArchive } from "lucide-react";
import { apiFetch } from "../../lib/api-client";

type Result = { file: string; ok: boolean; kind?: string; name?: string; error?: string };

const KIND_LABEL: Record<string, string> = {
  page: "Page template",
  email: "Email template",
  funnel: "Funnel",
};

export default function ImportPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<Result[]>([]);

  async function importFiles(files: File[]) {
    if (files.length === 0) return;
    setImporting(true);
    setResults([]);
    const out: Result[] = [];
    // One request per file so each gets its own result + partial success — a
    // bad bundle never blocks the rest.
    for (const file of files) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await apiFetch("/api/templates/import", { method: "POST", body: fd });
        const json = await res.json();
        if (!res.ok || !json.success) {
          out.push({ file: file.name, ok: false, error: json.error ?? "Import failed" });
        } else {
          out.push({ file: file.name, ok: true, kind: json.data.kind, name: json.data.name });
        }
      } catch {
        out.push({ file: file.name, ok: false, error: "Network error" });
      }
      setResults([...out]); // progressive update
    }
    setImporting(false);
  }

  function onPick(list: FileList | null) {
    if (!list) return;
    importFiles(Array.from(list));
    if (inputRef.current) inputRef.current.value = ""; // allow re-selecting same files
  }

  const okCount = results.filter((r) => r.ok).length;
  const failCount = results.length - okCount;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Import templates</h2>
        <p className="text-sm text-gray-500 mt-1">
          Import one or more <code className="font-mono text-xs">.ltbundle</code> files (page, email, or funnel templates) — e.g. downloaded from the Launchtic template library.
        </p>
      </div>

      {/* Drop zone / picker */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={importing}
        className="w-full flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center hover:border-blue-300 hover:bg-blue-50/40 transition-colors disabled:opacity-60"
      >
        {importing
          ? <Loader2 size={22} className="text-blue-500 animate-spin" />
          : <UploadCloud size={22} className="text-gray-400" />}
        <span className="text-sm font-medium text-gray-700">
          {importing ? "Importing…" : "Choose .ltbundle files"}
        </span>
        <span className="text-xs text-gray-400">You can select multiple files at once.</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".ltbundle"
        multiple
        className="sr-only"
        onChange={(e) => onPick(e.target.files)}
      />

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {okCount} imported{failCount > 0 ? ` · ${failCount} failed` : ""}
          </p>
          <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
            {results.map((r, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                {r.ok
                  ? <CheckCircle2 size={15} className="text-green-500 shrink-0" />
                  : <XCircle size={15} className="text-red-500 shrink-0" />}
                <FileArchive size={14} className="text-gray-300 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-800 truncate">{r.file}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {r.ok
                      ? `${KIND_LABEL[r.kind ?? ""] ?? r.kind} · ${r.name}`
                      : r.error}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
