"use client";

import { useState, useEffect } from "react";
import { Loader2, CheckCircle2, ArrowUpCircle, AlertCircle, Sparkles, ExternalLink, Copy, Check } from "lucide-react";
import { apiFetch } from "../../lib/api-client";

type VersionInfo = {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
  updatesLapsed: boolean;
  channel: "dated" | "rolling" | "dev";
  updateCommand: string;
};

export default function VersionPanel() {
  const [info, setInfo] = useState<VersionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiFetch("/api/version")
      .then((r) => r.json())
      .then((r) => { if (r.success) setInfo(r.data); })
      .finally(() => setLoading(false));
  }, []);

  async function copyCmd() {
    if (!info) return;
    try {
      await navigator.clipboard.writeText(info.updateCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure context) — the command stays visible to
      // copy manually.
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 size={14} className="animate-spin" /> Loading...
      </div>
    );
  }
  if (!info) return null;

  // Update guidance shows whenever there's something to do: a confirmed newer
  // release, a rolling channel (always re-pullable), or we couldn't check
  // (let the operator update anyway). A dated build that's up to date hides it.
  const unknown = info.channel !== "dev" && info.latest == null;
  // Hide the SSH command when there's nothing to pull: a lapsed update window
  // (renew first — the updater would be a no-op), a current dated build, or dev.
  const showCommand =
    !info.updatesLapsed && (info.updateAvailable || info.channel === "rolling" || unknown);

  // Variant picks the icon + colour + copy for the status card.
  const variant = info.updateAvailable
    ? { Icon: ArrowUpCircle, iconBg: "bg-blue-100", iconFg: "text-blue-600", border: "border-blue-200", bg: "bg-blue-50" }
    : info.updatesLapsed
    ? { Icon: Sparkles, iconBg: "bg-amber-100", iconFg: "text-amber-600", border: "border-amber-200", bg: "bg-amber-50" }
    : unknown
    ? { Icon: AlertCircle, iconBg: "bg-gray-100", iconFg: "text-gray-500", border: "border-gray-200", bg: "bg-white" }
    : { Icon: CheckCircle2, iconBg: "bg-green-100", iconFg: "text-green-600", border: "border-gray-200", bg: "bg-white" };

  const Icon = variant.Icon;

  const title = info.updateAvailable
    ? "Update available"
    : info.updatesLapsed
    ? "Renew to update"
    : "Up to date";

  const subtitle = info.updateAvailable
    ? `A newer release (${info.latest}) is available.`
    : info.updatesLapsed
    ? `A newer release (${info.latest}) exists — renew your updates to install it. Your license keeps running on ${info.current}.`
    : unknown
    ? "Couldn't reach launchtic.com to check for updates."
    : info.channel === "dev"
    ? "Local development build."
    : info.channel === "rolling"
    ? "Rolling channel — run the updater to pull the newest build."
    : "You're on the latest release.";

  return (
    <div className="max-w-xl space-y-3">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Version</h2>
        <p className="text-sm text-gray-500 mt-1">
          The Launchtic version running on this server.
        </p>
      </div>

      <div className={`rounded-xl border ${variant.border} ${variant.bg} px-4 py-3`}>
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg ${variant.iconBg} flex items-center justify-center shrink-0`}>
            <Icon size={15} className={variant.iconFg} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-gray-900">{title}</span>
              <code className="text-xs font-mono px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
                {info.current}
              </code>
            </div>
            <p className="text-xs text-gray-500 mt-0.5 leading-snug">{subtitle}</p>
          </div>
        </div>

        {showCommand && (
          <div className="mt-3">
            <p className="text-xs text-gray-500 mb-1.5">
              Run this on your server over SSH to update:
            </p>
            <div className="flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2">
              <code className="flex-1 font-mono text-xs text-green-300 break-all">
                {info.updateCommand}
              </code>
              <button
                type="button"
                onClick={copyCmd}
                className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-gray-300 hover:bg-gray-800 transition-colors"
              >
                {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        )}

        {info.updatesLapsed && (
          <a
            href="https://launchtic.com/account"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg leading-none"
          >
            <span>Renew updates</span>
            <ExternalLink size={11} />
          </a>
        )}
      </div>
    </div>
  );
}
