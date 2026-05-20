"use client";

import { useState, useRef } from "react";
import { Upload, X, FileText, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { apiFetch } from "../../lib/api-client";

type ImportResult = { imported: number; skipped: number; errors: string[]; total: number };

const REQUIRED_HEADERS = ["email"];
const OPTIONAL_HEADERS = ["firstName", "lastName", "phone", "country"];
const ALL_HEADERS = [...REQUIRED_HEADERS, ...OPTIONAL_HEADERS];

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const vals = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
  });
}

export default function ImportDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  function reset() {
    setRows(null);
    setFileName("");
    setResult(null);
    setError("");
  }

  function handleFile(file: File) {
    setError("");
    setResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCSV(text);
      if (!parsed.length) { setError("File is empty or invalid."); return; }
      if (!parsed[0].email) { setError("CSV must have an 'email' column."); return; }
      setRows(parsed);
      setFileName(file.name);
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!rows) return;
    setImporting(true);
    setError("");
    try {
      const contacts = rows.map((row) =>
        Object.fromEntries(
          ALL_HEADERS.filter((h) => row[h]).map((h) => [h, row[h]])
        )
      );
      const res = await apiFetch("/api/contacts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contacts),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Import failed"); return; }
      setResult(json.data);
    } catch {
      setError("Network error");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Import Contacts</h2>
          <button onClick={() => { reset(); onClose(); }} className="p-1 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {!result ? (
            <>
              {/* Drop zone */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                onClick={() => inputRef.current?.click()}
                className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,.txt,text/csv,text/plain"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
                {fileName ? (
                  <div className="flex flex-col items-center gap-2">
                    <FileText size={28} className="text-blue-500" />
                    <p className="text-sm font-medium text-gray-800">{fileName}</p>
                    <p className="text-xs text-gray-400">{rows?.length} rows detected</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload size={28} className="text-gray-300" />
                    <p className="text-sm text-gray-500">Drop a CSV file or click to browse</p>
                    <p className="text-xs text-gray-400">Required: <code>email</code> · Optional: firstName, lastName, phone, country</p>
                  </div>
                )}
              </div>

              {error && (
                <p className="flex items-center gap-1.5 text-sm text-red-600">
                  <AlertCircle size={14} /> {error}
                </p>
              )}

              <div className="flex items-center gap-2 justify-end">
                <button onClick={() => { reset(); onClose(); }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  disabled={!rows || importing}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl transition-colors"
                >
                  {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  Import {rows ? `${rows.length} contacts` : ""}
                </button>
              </div>
            </>
          ) : (
            /* Result */
            <div className="text-center py-4 space-y-4">
              <CheckCircle size={40} className="mx-auto text-green-500" />
              <div>
                <p className="text-base font-semibold text-gray-900">Import complete</p>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  {[
                    { label: "Imported", value: result.imported, color: "text-green-600" },
                    { label: "Skipped", value: result.skipped, color: "text-amber-600" },
                    { label: "Errors", value: result.errors.length, color: "text-red-500" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-gray-50 rounded-xl py-3">
                      <p className={`text-xl font-bold ${color}`}>{value}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
                {result.errors.length > 0 && (
                  <div className="mt-3 text-left bg-red-50 rounded-xl p-3 max-h-28 overflow-y-auto">
                    {result.errors.map((e, i) => (
                      <p key={i} className="text-xs text-red-600">{e}</p>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={onImported}
                className="px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
