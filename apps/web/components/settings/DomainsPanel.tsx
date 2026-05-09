"use client";

import { useState } from "react";
import { Globe, Trash2, CheckCircle, Clock, Plus, Loader2, Copy, Check, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useConfirm } from "../ui/ConfirmDialog";

type Domain = {
  id: string;
  domain: string;
  verified: boolean;
  isDefault: boolean;
  createdAt: string;
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={copy}
      className="p-1 text-gray-400 hover:text-gray-700 transition-colors"
      title="Copy"
    >
      {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
    </button>
  );
}

export default function DomainsPanel({
  initialDomains,
  rendererHost,
}: {
  initialDomains: Domain[];
  rendererHost: string;
}) {
  const [domains, setDomains] = useState(initialDomains);
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [promoting, setPromoting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const confirm = useConfirm();

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    setAdding(true);
    setError(null);

    const res = await fetch("/api/domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: input.trim() }),
    });
    const json = await res.json();
    setAdding(false);

    if (!res.ok) {
      setError(json.error ?? "Failed to add domain");
      return;
    }

    setDomains((prev) => [...prev, json]);
    setInput("");
  }

  async function handleVerify(id: string) {
    setVerifying(id);
    const res = await fetch(`/api/domains/${id}`, { method: "PATCH" });
    const json = await res.json();
    setVerifying(null);
    if (res.ok) {
      setDomains((prev) => prev.map((d) => (d.id === id ? { ...d, verified: true } : d)));
    }
  }

  async function handleDelete(id: string, domain: string) {
    const ok = await confirm({
      title: `Remove "${domain}"?`,
      description: "Funnel pages using this domain will stop working.",
      confirmLabel: "Remove",
      variant: "danger",
    });
    if (!ok) return;

    const res = await fetch(`/api/domains/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Failed to remove domain");
      return;
    }
    setDomains((prev) => prev.filter((d) => d.id !== id));
  }

  async function handleSetDefault(id: string) {
    setPromoting(id);
    setError(null);
    const res = await fetch(`/api/domains/${id}/set-default`, { method: "POST" });
    setPromoting(null);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Failed to promote domain");
      return;
    }
    setDomains((prev) =>
      prev.map((d) => ({ ...d, isDefault: d.id === id })),
    );
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center gap-2.5 mb-1">
        <Globe size={18} className="text-gray-700" />
        <h2 className="text-base font-semibold text-gray-900">Custom Domains</h2>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Point your own domain to this workspace. All funnels in this workspace will be accessible via the custom domain.
      </p>

      {/* Add domain form */}
      <form onSubmit={handleAdd} className="flex gap-2 mb-4">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="mycustomdomain.com"
          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={adding || !input.trim()}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-60 transition-colors"
        >
          {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Add
        </button>
      </form>

      {error && (
        <p className="text-sm text-red-600 mb-4">{error}</p>
      )}

      {/* Domain list */}
      {domains.length === 0 ? (
        <div className="py-10 text-center border-2 border-dashed border-gray-200 rounded-xl">
          <Globe size={24} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-400">No custom domains yet</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {domains.map((d) => (
            <div key={d.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {/* Domain row */}
              <div className="flex items-center gap-3 px-4 py-3.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-mono font-medium text-gray-900">{d.domain}</span>
                    {d.isDefault && (
                      <span className="flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                        <Star size={11} className="fill-blue-700" /> Default
                      </span>
                    )}
                    {d.verified ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                        <CheckCircle size={11} /> Active
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                        <Clock size={11} /> Pending
                      </span>
                    )}
                  </div>
                  {d.isDefault && (
                    <p className="text-xs text-gray-500 mt-1">
                      Funnels without a custom domain are served on this hostname.
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {!d.verified && (
                    <button
                      onClick={() => handleVerify(d.id)}
                      disabled={verifying === d.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 disabled:opacity-60 transition-colors"
                    >
                      {verifying === d.id ? <Loader2 size={12} className="animate-spin" /> : null}
                      Verify
                    </button>
                  )}
                  {d.verified && !d.isDefault && (
                    <button
                      onClick={() => handleSetDefault(d.id)}
                      disabled={promoting === d.id}
                      title="Promote to default — funnels without a custom domain will be served here"
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-60 transition-colors"
                    >
                      {promoting === d.id ? <Loader2 size={12} className="animate-spin" /> : <Star size={12} />}
                      Set as default
                    </button>
                  )}
                  {!d.isDefault && (
                    <button
                      onClick={() => handleDelete(d.id, d.domain)}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Remove domain"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* DNS instructions — show only when pending */}
              {!d.verified && (
                <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                  <p className="text-xs font-medium text-gray-600 mb-2">
                    Add this CNAME record to your DNS provider:
                  </p>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 font-mono text-xs bg-white border border-gray-200 rounded-lg px-3 py-2">
                      <span className="text-gray-400 w-12 shrink-0">Type</span>
                      <span className="text-gray-900 font-medium">CNAME</span>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-xs bg-white border border-gray-200 rounded-lg px-3 py-2">
                      <span className="text-gray-400 w-12 shrink-0">Name</span>
                      <span className="text-gray-900 font-medium flex-1">{d.domain}</span>
                      <CopyButton text={d.domain} />
                    </div>
                    <div className="flex items-center gap-2 font-mono text-xs bg-white border border-gray-200 rounded-lg px-3 py-2">
                      <span className="text-gray-400 w-12 shrink-0">Value</span>
                      <span className="text-gray-900 font-medium flex-1">{rendererHost}</span>
                      <CopyButton text={rendererHost} />
                    </div>
                  </div>

                  {/* Local testing tip */}
                  <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                    <p className="text-xs font-medium text-blue-700 mb-1">Testing locally?</p>
                    <p className="text-xs text-blue-600 mb-1.5">
                      Add this line to your <code className="bg-blue-100 px-1 rounded">hosts</code> file, then click Verify:
                    </p>
                    <div className="flex items-center gap-2 font-mono text-xs bg-white border border-blue-200 rounded px-2.5 py-1.5">
                      <span className="text-gray-800 flex-1">127.0.0.1  {d.domain}</span>
                      <CopyButton text={`127.0.0.1  ${d.domain}`} />
                    </div>
                    <p className="text-xs text-blue-500 mt-1.5">
                      File: <code className="bg-blue-100 px-1 rounded">C:\Windows\System32\drivers\etc\hosts</code> (Windows) or <code className="bg-blue-100 px-1 rounded">/etc/hosts</code> (Mac/Linux)
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
