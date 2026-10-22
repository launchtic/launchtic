"use client";

import { useState, useEffect } from "react";
import { Loader2, Check, Package, ChevronRight, Download, RotateCcw } from "lucide-react";
import { apiFetch } from "../../lib/api-client";

type ProductFile = { name: string; bytes: number };
type Purchase = {
  key: string;
  product?: { sku: string; name: string };
  files?: ProductFile[];
  installed?: string[];   // files already installed on this server (from the license server)
  activated?: boolean;    // key already bound to this server
  error?: string;
};

function fmtBytes(n: number): string {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}
// "coffee.ltbundle" → "coffee"
function displayName(file: string): string {
  return file.replace(/\.ltbundle$/, "");
}

export default function PurchasesPanel() {
  const [workspace, setWorkspace] = useState("");
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [key, setKey] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  useEffect(() => {
    apiFetch("/api/purchases")
      .then((r) => r.json())
      .then((r) => {
        if (!r.success) return;
        setWorkspace(r.data.workspace);
        setPurchases(r.data.purchases);
      })
      .finally(() => setLoading(false));
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setAddError("");
    // Plan license keys (LT-…) look alike — point the user to the right tab.
    if (/^LT-/i.test(key.trim())) return setAddError("This is a license key — enter it in the Plan tab.");
    setAdding(true);
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

  function update(next: Purchase) {
    setPurchases((ps) => ps.map((p) => (p.key === next.key ? next : p)));
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 size={14} className="animate-spin" /> Loading...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Add-ons</h2>
        <p className="text-sm text-gray-500 mt-1">
          Enter an add-on key from launchtic.com to install it into this workspace.
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
      {addError && <p className="text-sm text-red-600">{addError}</p>}

      {purchases.map((p) => (
        <PurchaseCard key={p.key} purchase={p} workspace={workspace} onChange={update} />
      ))}
    </div>
  );
}

function PurchaseCard({
  purchase: p,
  workspace,
  onChange,
}: {
  purchase: Purchase;
  workspace: string;
  onChange: (p: Purchase) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const files = p.files ?? [];
  const installed = new Set(p.installed ?? []);
  // Not-installed first, then by name.
  const sorted = [...files].sort(
    (a, b) => Number(installed.has(a.name)) - Number(installed.has(b.name)) || a.name.localeCompare(b.name),
  );
  const pending = sorted.filter((f) => !installed.has(f.name));
  const failedCount = pending.filter((f) => failed[f.name]).length;
  // Files added to the product after the first install are "new".
  const isNew = (f: ProductFile) => p.activated && !installed.has(f.name);

  async function installOne(file: string): Promise<boolean> {
    setBusy((s) => new Set(s).add(file));
    const r = await apiFetch("/api/purchases/install", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: p.key, file }),
    }).then((res) => res.json()).catch(() => ({ success: false, error: "Network error" }));
    setBusy((s) => { const n = new Set(s); n.delete(file); return n; });
    if (r.success) {
      setFailed((f) => { const { [file]: _, ...rest } = f; return rest; });
      p = { ...p, activated: true, installed: [...(p.installed ?? []), file] };
      onChange(p);
      return true;
    }
    setFailed((f) => ({ ...f, [file]: r.error ?? "Install failed" }));
    return false;
  }

  // One at a time: each install is a server-to-server download + import, and
  // sequential runs keep progress readable and one failure from stopping the rest.
  async function installPending() {
    const todo = pending.map((f) => f.name);
    setProgress({ done: 0, total: todo.length });
    for (let i = 0; i < todo.length; i++) {
      await installOne(todo[i]);
      setProgress({ done: i + 1, total: todo.length });
    }
    setProgress(null);
  }

  const summary = p.error
    ? null
    : pending.length === 0
      ? `✓ All ${files.length} templates installed`
      : p.activated
        ? `${files.length - pending.length}/${files.length} installed · ${pending.length} new`
        : `${files.length} templates · ${fmtBytes(files.reduce((s, f) => s + f.bytes, 0))}`;

  const actionLabel = failedCount > 0 && failedCount === pending.length
    ? `Retry ${failedCount} failed`
    : p.activated ? `Install ${pending.length} new` : `Install all (${pending.length})`;

  return (
    <div className="rounded-xl border border-gray-200">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
          <Package size={15} className="text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-900 truncate">{p.product?.name ?? "Unavailable"}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {progress ? `Installing ${progress.done}/${progress.total}…` : summary}
            <span className="font-mono text-[11px] text-gray-400 ml-2">{p.key}</span>
          </div>
          {!p.error && pending.length > 0 && workspace && (
            <div className="text-xs text-gray-500 mt-0.5">
              Installs into: <span className="font-medium text-gray-700">{workspace}</span>
            </div>
          )}
        </div>
        {!p.error && pending.length > 0 && (
          <button
            onClick={installPending}
            disabled={!!progress || busy.size > 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gray-900 hover:bg-black text-white rounded-lg disabled:opacity-50"
          >
            {progress ? <Loader2 size={12} className="animate-spin" /> : failedCount ? <RotateCcw size={12} /> : <Download size={12} />}
            {progress ? "Installing" : actionLabel}
          </button>
        )}
      </div>

      {progress && (
        <div className="h-1 bg-gray-100">
          <div className="h-1 bg-blue-600 transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
        </div>
      )}

      {p.error && (
        <p className="px-4 pb-3 text-sm text-red-600">
          {p.error}{" "}
          <a href="https://launchtic.com/support" target="_blank" rel="noopener noreferrer" className="underline">Support</a>
        </p>
      )}

      {!p.error && files.length > 0 && (
        <>
          <button
            onClick={() => setOpen((o) => !o)}
            className="w-full flex items-center gap-1 px-4 py-2 text-xs font-medium text-gray-500 hover:text-gray-800 border-t border-gray-100"
          >
            <ChevronRight size={12} className={`transition-transform ${open ? "rotate-90" : ""}`} />
            {open ? "Hide templates" : "Show templates"}
          </button>
          {open && (
            <ul className="max-h-80 overflow-y-auto divide-y divide-gray-50 border-t border-gray-100">
              {sorted.map((f) => {
                const done = installed.has(f.name);
                return (
                  <li key={f.name} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <span className={`flex-1 min-w-0 truncate ${done ? "text-gray-400" : "text-gray-700"}`}>
                      {displayName(f.name)}
                      {isNew(f) && (
                        <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">NEW</span>
                      )}
                    </span>
                    <span className="text-xs text-gray-400">{fmtBytes(f.bytes)}</span>
                    <span className="w-14 flex justify-end">
                      {done ? (
                        <Check size={14} className="text-green-600" />
                      ) : busy.has(f.name) ? (
                        <Loader2 size={14} className="animate-spin text-gray-400" />
                      ) : (
                        <button
                          onClick={() => installOne(f.name)}
                          disabled={!!progress}
                          title={failed[f.name]}
                          className={`text-xs font-semibold hover:underline disabled:opacity-50 ${failed[f.name] ? "text-red-600" : "text-blue-600"}`}
                        >
                          {failed[f.name] ? "Retry" : "Install"}
                        </button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
