"use client";

// First-run wizard Step 2 — domains + DNS verify + Caddy hot reload.
// Mirrors Step1's card chrome (logo + framed white card) for visual
// continuity through the install flow.

import { useState } from "react";
import { Loader2, Check, X, Copy, AlertTriangle } from "lucide-react";

type DnsCheck = {
  name:     string;
  ip:       string;
  resolved: string[] | null;
  matches:  boolean;
  error?:   string;
};
type DnsReport = {
  app:   { domain: string; checks: DnsCheck[]; ready: boolean };
  pages: { domain: string; checks: DnsCheck[]; ready: boolean };
};

type Phase = "input" | "verifying" | "configuring" | "issuing" | "done";

export default function Step2DomainsForm({
  serverIp,
  allowSkip,
}: {
  serverIp:   string;
  allowSkip?: boolean;
}) {
  const [appDomain, setAppDomain]     = useState("");
  const [pagesDomain, setPagesDomain] = useState("");
  const [phase, setPhase]             = useState<Phase>("input");
  const [dnsReport, setDnsReport]     = useState<DnsReport | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [finalUrl, setFinalUrl]       = useState<string>("");

  const verifyDns = async () => {
    setPhase("verifying");
    setError(null);
    try {
      const res = await fetch("/api/setup/dns-verify", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ appDomain, pagesDomain, serverIp }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "DNS verify failed");
      setDnsReport(json.data);
      if (!json.data.app.ready || !json.data.pages.ready) {
        setPhase("input");  // back to form, show partial results
        return;
      }
      await commit();
    } catch (e: any) {
      setPhase("input");
      setError(e?.message ?? "DNS verify failed");
    }
  };

  const commit = async (skipDns = false, overrideApp?: string, overridePages?: string) => {
    setPhase("configuring");
    try {
      const res = await fetch("/api/setup/configure", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          appDomain:   overrideApp   ?? appDomain,
          pagesDomain: overridePages ?? pagesDomain,
          skipDns,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Configuration failed");
      setFinalUrl(json.data.appUrl);
      setPhase("issuing");
      pollHealth(json.data.appUrl);
    } catch (e: any) {
      setPhase("input");
      setError(e?.message ?? "Configuration failed");
    }
  };

  // Localhost / dev bypass — skips DNS verify + tolerates an unreachable
  // Caddy. Domains default to .localhost subdomains so the operator doesn't
  // have to fill anything in just to dismiss the wizard.
  const skipAndConfigure = async () => {
    setError(null);
    const a = appDomain   || "app.localhost";
    const p = pagesDomain || "pages.localhost";
    await commit(true, a, p);
  };

  const pollHealth = async (appUrl: string) => {
    // Poll until two things complete:
    //   1. Web container restarts (configure endpoint exits process 0 after
    //      response — Docker restart_policy brings it back in ~5s). The
    //      restart is needed so entrypoint.sh re-reads SystemConfig and
    //      exports AUTH_URL, fixing the NextAuth signOut Docker bug.
    //   2. Caddy finishes the ACME handshake for the new domain.
    // Opaque no-cors response = TLS handshake + tcp connection succeeded =
    // both are ready. 60 attempts × 3s = 3 min budget (covers worst case).
    for (let i = 0; i < 60; i++) {
      try {
        await fetch(`${appUrl}/api/health`, { mode: "no-cors", cache: "no-store" });
        setPhase("done");
        setTimeout(() => { window.location.href = `${appUrl}/login`; }, 1200);
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    setPhase("done");  // timeout but show the URL anyway
  };

  const dnsReady = dnsReport?.app.ready && dnsReport?.pages.ready;
  const canSubmit = appDomain && pagesDomain && appDomain !== pagesDomain;

  return (
    <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.svg"
        alt="launchtic"
        className="h-8 w-auto max-w-[180px] object-contain mb-6"
      />

      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
          Step 2 of 2
        </span>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Configure your domains</h1>
      <p className="text-gray-500 text-sm mb-6">
        Server IP: <span className="font-mono text-gray-700">{serverIp || "—"}</span>
      </p>

      {phase === "input" && (
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dashboard URL (admin panel)</label>
            <div className="flex items-stretch">
              <span className="px-3 flex items-center text-xs text-gray-400 bg-gray-50 border border-r-0 border-gray-300 rounded-l-lg">https://</span>
              <input
                value={appDomain}
                onChange={(e) => setAppDomain(e.target.value.trim().toLowerCase())}
                placeholder="app.yourdomain.com"
                autoFocus
                className={input + " rounded-l-none"}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pages URL (published funnels)</label>
            <div className="flex items-stretch">
              <span className="px-3 flex items-center text-xs text-gray-400 bg-gray-50 border border-r-0 border-gray-300 rounded-l-lg">https://</span>
              <input
                value={pagesDomain}
                onChange={(e) => setPagesDomain(e.target.value.trim().toLowerCase())}
                placeholder="pages.yourdomain.com"
                className={input + " rounded-l-none"}
              />
            </div>
          </div>

          {serverIp && appDomain && pagesDomain && (
            <DnsGuide serverIp={serverIp} appDomain={appDomain} pagesDomain={pagesDomain} />
          )}

          {dnsReport && !dnsReady && (
            <DnsResults report={dnsReport} />
          )}

          {error && (
            <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
          )}

          <button
            type="button"
            disabled={!canSubmit}
            onClick={verifyDns}
            className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-60"
          >
            {dnsReport ? "Re-check DNS" : "I've added the DNS records"}
          </button>

          {allowSkip && (
            <button
              type="button"
              onClick={skipAndConfigure}
              className="w-full text-xs text-gray-500 hover:text-gray-800 py-1 -mt-1 underline"
              title="Skip DNS verification + tolerate unreachable Caddy. Domains default to *.localhost if empty. Local dev only."
            >
              Skip DNS &amp; SSL (local dev)
            </button>
          )}
        </div>
      )}

      {phase === "verifying"   && <Status icon={Loader2} spin label="Verifying DNS across resolvers…" />}
      {phase === "configuring" && <Status icon={Loader2} spin label="Configuring Caddy + persisting settings…" />}
      {phase === "issuing"     && <Status icon={Loader2} spin label="Issuing SSL certificates (Let's Encrypt)…" sub="This can take 30-90 seconds." />}
      {phase === "done" && (
        <div>
          <Status icon={Check} label="Setup complete!" />
          <p className="mt-4 text-xs text-gray-500 text-center">
            Redirecting to{" "}
            <a className="text-blue-600 underline" href={`${finalUrl}/login`}>{finalUrl}</a>…
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DnsGuide({ serverIp, appDomain, pagesDomain }: { serverIp: string; appDomain: string; pagesDomain: string }) {
  const appHost   = appDomain.split(".")[0] || "app";
  const pagesHost = pagesDomain.split(".")[0] || "pages";
  return (
    <div className="border border-gray-200 bg-gray-50 rounded-lg p-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
        Add these DNS A records
      </p>
      <div className="font-mono text-[11px] text-gray-700 space-y-1">
        <Row type="A" name={appHost}   value={serverIp} />
        <Row type="A" name={pagesHost} value={serverIp} />
      </div>
      <p className="text-[11px] text-gray-400 mt-2.5 leading-relaxed">
        Add them in your DNS provider (Cloudflare, Namecheap, GoDaddy…) then click below.
        DNS propagation can take 1-30 minutes.
      </p>
    </div>
  );
}

function Row({ type, name, value }: { type: string; name: string; value: string }) {
  const copy = () => navigator.clipboard.writeText(value);
  return (
    <div className="flex items-center gap-3">
      <span className="w-6 text-gray-500">{type}</span>
      <span className="w-16 text-gray-800">{name}</span>
      <span className="flex-1 text-gray-800">{value}</span>
      <button onClick={copy} className="text-gray-400 hover:text-gray-700" title="Copy">
        <Copy size={11} />
      </button>
    </div>
  );
}

function DnsResults({ report }: { report: DnsReport }) {
  return (
    <div className="border border-amber-200 bg-amber-50 rounded-lg p-3.5">
      <div className="flex items-start gap-2 mb-2">
        <AlertTriangle size={13} className="text-amber-600 mt-0.5 shrink-0" />
        <p className="text-xs font-medium text-amber-900">DNS not fully propagated yet</p>
      </div>
      <DomainCheck label={report.app.domain}   checks={report.app.checks} />
      <DomainCheck label={report.pages.domain} checks={report.pages.checks} />
    </div>
  );
}

function DomainCheck({ label, checks }: { label: string; checks: DnsCheck[] }) {
  return (
    <div className="mt-2">
      <p className="text-[11px] font-mono text-gray-700 mb-0.5">{label}</p>
      <div className="space-y-0.5">
        {checks.map((c) => (
          <div key={c.ip} className="flex items-center gap-2 text-[11px]">
            {c.matches
              ? <Check size={11} className="text-green-600" />
              : <X size={11}    className="text-red-500" />}
            <span className="text-gray-600 w-24">{c.name} ({c.ip})</span>
            <span className="text-gray-500 truncate">{c.resolved?.join(", ") || c.error || "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Status({ icon: Icon, spin, label, sub }: { icon: any; spin?: boolean; label: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8">
      <Icon size={28} className={`text-blue-600 ${spin ? "animate-spin" : ""}`} />
      <p className="mt-4 text-sm font-medium text-gray-900">{label}</p>
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

const input = "flex-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";
