"use client";

import { useState } from "react";
import { Globe, Trash2, CheckCircle, Clock, Plus, Loader2, Copy, Check, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useConfirm } from "../ui/ConfirmDialog";
import { apiFetch } from "../../lib/api-client";
import { useRole } from "../../lib/role";

type Domain = {
  id: string;
  domain: string;
  verified: boolean;
  isDefault: boolean;
  createdAt: string;
  funnelCount: number;
};

/** Heuristic apex-domain detector. Apex domains can't be CNAME'd (RFC 1034)
 *  so we steer users toward subdomains. <3 labels treated as apex. Edge
 *  case: ccTLDs like example.co.uk technically have 3 labels but ARE apex;
 *  those users just need a longer subdomain like www.example.co.uk anyway. */
function isLikelyApex(domain: string): boolean {
  return domain.split(".").filter(Boolean).length < 3;
}

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
  const { canManageDomains } = useRole();
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
    const value = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!value) return;

    // Apex-domain guard. CNAME is not allowed on the zone apex (RFC 1034),
    // so a bare root like "example.com" can't point at the pages domain via
    // the standard verify flow. Force a subdomain prefix (www., app., etc.)
    // before hitting the API. Heuristic: <3 labels = apex. Misses ccTLD edge
    // cases like example.co.uk, but those users just need a longer subdomain.
    if (isLikelyApex(value)) {
      setError(`Use a subdomain like www.${value} or sales.${value}.`);
      return;
    }

    setAdding(true);
    setError(null);

    const res = await apiFetch("/api/domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: value }),
    });
    const json = await res.json();
    setAdding(false);

    if (!res.ok) {
      setError(json.error ?? "Failed to add domain");
      return;
    }

    setDomains((prev) => [...prev, { ...json, funnelCount: 0 }]);
    setInput("");
  }

  async function handleVerify(id: string) {
    setVerifying(id);
    setError(null);
    const res = await apiFetch(`/api/domains/${id}`, { method: "PATCH" });
    const json = await res.json().catch(() => ({}));
    setVerifying(null);
    if (!res.ok) {
      setError(json.error ?? "Failed to verify domain");
      return;
    }
    setDomains((prev) => prev.map((d) => (d.id === id ? { ...d, verified: true } : d)));
  }

  async function handleDelete(id: string, domain: string, funnelCount: number) {
    const ok = await confirm({
      title: `Remove "${domain}"?`,
      description: funnelCount > 0
        ? `${funnelCount} funnel${funnelCount === 1 ? "" : "s"} use this domain — they'll revert to the default domain and this URL will stop working.`
        : "Funnel pages using this domain will stop working.",
      confirmLabel: "Remove",
      variant: "danger",
    });
    if (!ok) return;

    const res = await apiFetch(`/api/domains/${id}`, { method: "DELETE" });
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
    const res = await apiFetch(`/api/domains/${id}/set-default`, { method: "POST" });
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
      {canManageDomains && (
        <form onSubmit={handleAdd} className="mb-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="www.mybrand.com"
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
          </div>
          <p className="mt-1.5 text-xs text-gray-500 leading-relaxed">
            Use a subdomain — <span className="font-mono">www.mybrand.com</span>,{" "}
            <span className="font-mono">sales.mybrand.com</span>,{" "}
            <span className="font-mono">shop.mybrand.com</span>.
          </p>
        </form>
      )}

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
                  {canManageDomains && !d.verified && (
                    <button
                      onClick={() => handleVerify(d.id)}
                      disabled={verifying === d.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 disabled:opacity-60 transition-colors"
                    >
                      {verifying === d.id ? <Loader2 size={12} className="animate-spin" /> : null}
                      Verify
                    </button>
                  )}
                  {canManageDomains && d.verified && !d.isDefault && (
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
                  {canManageDomains && !d.isDefault && (
                    <button
                      onClick={() => handleDelete(d.id, d.domain, d.funnelCount)}
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
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
