"use client";

import { useState, useEffect } from "react";
import { Loader2, Check, X, Download, Trash2, Package } from "lucide-react";
import { apiFetch } from "../../lib/api-client";

type ProductFile = { name: string; bytes: number };
type Purchase = {
  key: string;
  product?: { sku: string; name: string };
  files?: ProductFile[];
  error?: string;
};
// Per-file install state, keyed by `${key}/${file}`. Session-only: we don't
// track installs, so re-installing a file creates another copy.
type FileState = { status: "busy" | "done" | "error"; message?: string };

function fmtBytes(n: number): string {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}
// "coffee.ltbundle" → "coffee"
function displayName(file: string): string {
  return file.replace(/\.ltbundle$/, "");
}

export default function PurchasesPanel() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [key, setKey] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [states, setStates] = useState<Record<string, FileState>>({});
  const [running, setRunning] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/purchases")
      .then((r) => r.json())
      .then((r) => { if (r.success) setPurchases(r.data); })
      .finally(() => setLoading(false));
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setAddError("");
    try {
      const r = await apiFetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      }).then((res) => res.json());
      if (!r.success) return setAddError(r.error ?? "Invalid key");
      setPurchases((ps) => [r.data, ...ps.filter((p) => p.key !== r.data.key)]);
      setKey("");
    } finally {
      setAdding(false);
    }
  }

  async function remove(p: Purchase) {
    if (!confirm("Remove this key? Templates you already installed stay.")) return;
    await apiFetch(`/api/purchases?key=${encodeURIComponent(p.key)}`, { method: "DELETE" });
    setPurchases((ps) => ps.filter((x) => x.key !== p.key));
  }

  async function install(p: Purchase, file: string) {
    const id = `${p.key}/${file}`;
    setStates((s) => ({ ...s, [id]: { status: "busy" } }));
    const r = await apiFetch("/api/purchases/install", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: p.key, file }),
    }).then((res) => res.json()).catch(() => ({ success: false, error: "Network error" }));
    setStates((s) => ({
      ...s,
      [id]: r.success ? { status: "done" } : { status: "error", message: r.error ?? "Install failed" },
    }));
  }

  // One at a time: each install is a server-to-server download + import, and
  // sequential runs keep progress readable and one failure from stopping the rest.
  async function installAll(p: Purchase) {
    setRunning(p.key);
    try {
      for (const f of p.files ?? []) {
        if (states[`${p.key}/${f.name}`]?.status === "done") continue;
        await install(p, f.name);
      }
    } finally {
      setRunning(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 size={14} className="animate-spin" /> Loading...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Purchases</h2>
        <p className="text-sm text-gray-500 mt-1">
          Enter a product key from launchtic.com to install its templates into this workspace.
        </p>
      </div>

      <form onSubmit={add} className="flex gap-2">
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="LTP-XXXX-XXXX-XXXX-XXXX"
          className="flex-1 min-w-0 px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
        <button
          type="submit"
          disabled={adding || !key.trim()}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-gray-900 hover:bg-black text-white rounded-lg disabled:opacity-50"
        >
          {adding && <Loader2 size={14} className="animate-spin" />} Add key
        </button>
      </form>
      {addError && <p className="text-sm text-red-600 -mt-4">{addError}</p>}

      {purchases.map((p) => {
        const files = p.files ?? [];
        const done = files.filter((f) => states[`${p.key}/${f.name}`]?.status === "done").length;
        const isRunning = running === p.key;
        return (
          <div key={p.key} className="rounded-xl border border-gray-200">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                <Package size={15} className="text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-900 truncate">{p.product?.name ?? "Unavailable"}</div>
                <code className="text-[11px] font-mono text-gray-400">{p.key}</code>
              </div>
              {files.length > 0 && (
                <button
                  onClick={() => installAll(p)}
                  disabled={running !== null}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gray-900 hover:bg-black text-white rounded-lg disabled:opacity-50"
                >
                  {isRunning ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                  {isRunning || done > 0 ? `${done}/${files.length} installed` : `Install all (${files.length})`}
                </button>
              )}
              <button onClick={() => remove(p)} className="p-1.5 text-gray-400 hover:text-red-600" title="Remove key">
                <Trash2 size={14} />
              </button>
            </div>

            {p.error ? (
              <p className="px-4 py-3 text-sm text-red-600">{p.error}</p>
            ) : (
              <ul className="max-h-80 overflow-y-auto divide-y divide-gray-50">
                {files.map((f) => {
                  const st = states[`${p.key}/${f.name}`];
                  return (
                    <li key={f.name} className="flex items-center gap-3 px-4 py-2 text-sm">
                      <span className="flex-1 min-w-0 truncate text-gray-700">{displayName(f.name)}</span>
                      <span className="text-xs text-gray-400">{fmtBytes(f.bytes)}</span>
                      {st?.status === "busy" ? (
                        <Loader2 size={14} className="animate-spin text-gray-400" />
                      ) : st?.status === "done" ? (
                        <Check size={14} className="text-green-600" />
                      ) : (
                        <button
                          onClick={() => install(p, f.name)}
                          disabled={isRunning}
                          className="text-xs font-semibold text-blue-600 hover:underline disabled:opacity-50"
                        >
                          {st?.status === "error" ? "Retry" : "Install"}
                        </button>
                      )}
                      {st?.status === "error" && (
                        <span className="text-xs text-red-600 inline-flex items-center gap-1" title={st.message}>
                          <X size={12} /> Failed
                        </span>
                      )}
                    </li>
                  );
                })}
                {files.length === 0 && <li className="px-4 py-3 text-sm text-gray-400">No files yet.</li>}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
