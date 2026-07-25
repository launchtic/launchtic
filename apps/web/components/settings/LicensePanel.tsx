"use client";

import { useState, useEffect } from "react";
import { Loader2, ExternalLink, ShieldCheck, ShieldOff } from "lucide-react";
import { apiFetch } from "../../lib/api-client";
import { planLabel, planColor } from "../../lib/plan";
import { useRole } from "../../lib/role";

type LicenseStatus = {
  plan: string | null;          // null = Free tier (no Agency subscription)
  licenseKey: string | null;
  expiresAt: string | null;     // Agency subscription's current paid-through date
};

export default function LicensePanel() {
  const { isOwner } = useRole();
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/license")
      .then((r) => r.json())
      .then((r) => { if (r.success) setStatus(r.data); })
      .finally(() => setLoading(false));
  }, []);

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
        <h2 className="text-base font-semibold text-gray-900">License</h2>
        <p className="text-sm text-gray-500 mt-1">
          Your license and plan for this instance. Activation happens automatically at install.
        </p>
      </div>

      {/* Status hero — color-coded license health with the key inline. Renew /
          upgrade / billing live on launchtic.com/account. */}
      <StatusHero status={status} isOwner={isOwner} />
    </div>
  );
}

// ─── Status hero card ──────────────────────────────────────────────────────
// Big color-coded card communicating license health at a glance. Three visual
// states; copy adapts to each. The primary action always points at
// launchtic.com/account, the single home for renew / upgrade / billing.

function StatusHero({
  status,
  isOwner,
}: {
  status: LicenseStatus | null;
  isOwner: boolean;
}) {
  if (!status) return null;

  // Two states: no Agency subscription (Free) or an active one.
  const isLocked = !status.plan;

  const variant = isLocked ? {
        bg:       "bg-gray-50",
        border:   "border-gray-200",
        iconBg:   "bg-gray-100",
        iconFg:   "text-gray-500",
        accent:   "text-gray-900",
        Icon:     ShieldOff,
        eyebrow:  "No license",
        title:    "Unlicensed",
        subtitle: "No license detected on this instance. Get a license to unlock Launchtic.",
      }
    : {
        bg:       "bg-green-50",
        border:   "border-green-200",
        iconBg:   "bg-green-100",
        iconFg:   "text-green-600",
        accent:   "text-green-900",
        Icon:     ShieldCheck,
        eyebrow:  "License active",
        title:    `${planLabel(status.plan)} plan`,
        subtitle: status.expiresAt
          ? `Renews ${new Date(status.expiresAt).toLocaleDateString()}.`
          : "Active.",
      };

  const Icon = variant.Icon;

  return (
    <div className={`rounded-xl border ${variant.border} ${variant.bg} px-4 py-3`}>
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg ${variant.iconBg} flex items-center justify-center shrink-0`}>
          <Icon size={15} className={variant.iconFg} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-semibold ${variant.accent}`}>{variant.title}</span>
            {!isLocked && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${planColor(status.plan)}`}>
                {planLabel(status.plan)}
              </span>
            )}
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${variant.iconFg}`}>
              · {variant.eyebrow}
            </span>
          </div>
          <p className={`text-xs ${variant.accent} opacity-70 mt-0.5 leading-snug`}>{variant.subtitle}</p>
        </div>

        {/* Primary action — all license management lives on launchtic.com/account. */}
        {isLocked ? (
          <a
            href="https://launchtic.com/pricing"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gray-900 hover:bg-black text-white rounded-lg leading-none"
          >
            <span>Get a license</span>
            <ExternalLink size={11} />
          </a>
        ) : isOwner && (
          <a
            href="https://launchtic.com/account"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg leading-none bg-white hover:bg-gray-50 text-gray-700 border border-gray-200"
          >
            <ExternalLink size={11} />
            <span>Manage license</span>
          </a>
        )}
      </div>

      {/* License key inline — keeps the panel compact (no separate card). */}
      {status.licenseKey && (
        <div className="mt-3 pt-3 border-t border-black/5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">License Key</span>
          <code className="block text-xs font-mono text-gray-600 break-all mt-0.5">{status.licenseKey}</code>
        </div>
      )}
    </div>
  );
}
