"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Key, CheckCircle, XCircle, Loader2, ExternalLink, ShieldCheck, ShieldOff, Sparkles } from "lucide-react";
import { apiFetch } from "../../lib/api-client";
import { planLabel, planColor } from "../../lib/plan";
import { useRole } from "../../lib/role";

type LicenseStatus = {
  plan: string;
  licenseKey: string | null;
  expiresAt: string | null;
  isExpired: boolean;
};

export default function LicensePanel() {
  const { update } = useSession();
  const router = useRouter();
  const { isOwner } = useRole();
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [keyInput, setKeyInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);

  useEffect(() => {
    apiFetch("/api/license")
      .then((r) => r.json())
      .then((r) => { if (r.success) setStatus(r.data); })
      .finally(() => setLoading(false));
  }, []);

  // Open Stripe Customer Portal in a new tab — operator can update card,
  // view invoices, or cancel subscription self-serve. Server proxies to
  // launchtic.com/api/portal which returns a one-time portal URL.
  async function openBillingPortal() {
    setOpeningPortal(true);
    setError(null);
    try {
      const res  = await apiFetch("/api/billing/portal", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json?.data?.url) {
        setError(json?.error ?? "Could not open billing portal.");
        return;
      }
      // Use top-level navigation, not window.open — popup blockers fire
      // when the navigation is async and not directly from a click handler.
      window.location.href = json.data.url;
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setOpeningPortal(false);
    }
  }

  // First-time activation only — shown when the install is still on the
  // Community plan. Once a paid license is bound, this form is hidden;
  // any later swap (tier change, key rotation) is handled by support so
  // the operator doesn't paste a wrong key and brick their org.
  async function activate() {
    if (!keyInput.trim()) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch("/api/license", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenseKey: keyInput.trim() }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error ?? "Failed to activate license.");
      } else {
        const newPlan = data.data.plan;
        setSuccess(`License activated! Plan: ${newPlan}`);
        setKeyInput("");
        setStatus((prev) => prev ? { ...prev, plan: newPlan, licenseKey: "LT-••••••••", expiresAt: data.data.expiresAt, isExpired: false } : prev);
        // Update session immediately — no re-login needed.
        await update({ workspacePlan: newPlan });
        router.refresh();
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // Plan color + label come from the shared helper. Enum values (COMMUNITY/
  // STARTER/AGENCY/CUSTOM) are the same names the operator sees in the UI —
  // no mapping layer.

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 size={14} className="animate-spin" /> Loading...
      </div>
    );
  }

  // First-time-activation gate. Once a license is bound, the form is
  // hidden; further changes go through support (see activate() comment).
  const isCommunity = !status?.plan || status.plan === "COMMUNITY";

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="text-base font-semibold text-gray-900">License</h2>
        <p className="text-sm text-gray-500 mt-1">
          Activate a Starter, Agency, or Custom license key to unlock advanced features.
        </p>
      </div>

      {/* Status hero — color-coded so the operator instantly sees license
          health when they land on this page. State derivation:
            - community  : free self-host, neutral gray (upgrade prompt)
            - active     : paid + valid, green (auto-renew is healthy)
            - expired    : paid + past expiresAt, RED with affected-features
                           list so the operator understands what broke
          Auto-renew billing means we don't surface a yellow "expiring soon"
          state — Stripe charges before expiry, so a healthy sub never sees it. */}
      <StatusHero status={status} onOpenPortal={openBillingPortal} openingPortal={openingPortal} isOwner={isOwner} />

      {/* Portal-open error — inline alert, only renders on failure. Lives
          here (not inside the hero) so the hero stays stable in size.
          Only shown when there's no activate form to consume the error. */}
      {error && !isCommunity && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 flex items-start gap-2">
          <XCircle size={14} className="text-red-600 shrink-0 mt-0.5" />
          <p className="text-xs text-red-700 leading-snug">{error}</p>
        </div>
      )}

      {/* Active key */}
      {status?.licenseKey && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">License Key</p>
          <code className="text-sm font-mono text-gray-700">{status.licenseKey}</code>
        </div>
      )}

      {/* First-time activation form — Community only. After the install is
          bound to a paid license, this disappears and tier changes go via
          support (avoids "I pasted the wrong key" support threads). */}
      {isCommunity && isOwner && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <p className="text-sm font-medium text-gray-700">Activate License Key</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Key size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="LT-STR-xxxx / LT-AGY-xxxx / LT-CUS-xxxx"
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                onKeyDown={(e) => e.key === "Enter" && activate()}
              />
            </div>
            <button
              onClick={activate}
              disabled={saving || !keyInput.trim()}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {saving && <Loader2 size={13} className="animate-spin" />}
              Activate
            </button>
          </div>

          {error && (
            <p className="text-xs text-red-600 flex items-center gap-1.5">
              <XCircle size={12} /> {error}
            </p>
          )}
          {success && (
            <p className="text-xs text-green-600 flex items-center gap-1.5">
              <CheckCircle size={12} /> {success}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Status hero card ──────────────────────────────────────────────────────
// Big color-coded card communicating license health at a glance. Three
// visual states; copy adapts to each. No countdown noise for active subs
// (Stripe auto-renews — the operator never needs to act on an active sub
// unless they want to change card / cancel via the Manage subscription btn).

function StatusHero({
  status,
  onOpenPortal,
  openingPortal,
  isOwner,
}: {
  status:           LicenseStatus | null;
  onOpenPortal:    () => void;
  openingPortal:   boolean;
  isOwner: boolean;
}) {
  if (!status) return null;

  const isCommunity = !status.plan || status.plan === "COMMUNITY";
  const isExpired   = status.isExpired;
  const isActive    = !isCommunity && !isExpired;

  // Palette + icon + copy per state. Kept inline (single component, easier
  // to scan than dispatch to helpers).
  const variant = isExpired   ? {
        bg:       "bg-red-50",
        border:   "border-red-200",
        iconBg:   "bg-red-100",
        iconFg:   "text-red-600",
        accent:   "text-red-900",
        Icon:     ShieldOff,
        eyebrow:  "License expired",
        title:    `${planLabel(status.plan)} plan`,
        subtitle: status.expiresAt
          ? `Expired on ${new Date(status.expiresAt).toLocaleDateString()}. Premium features are disabled.`
          : "Premium features are disabled.",
      }
    : isCommunity ? {
        bg:       "bg-gray-50",
        border:   "border-gray-200",
        iconBg:   "bg-gray-100",
        iconFg:   "text-gray-500",
        accent:   "text-gray-900",
        Icon:     Sparkles,
        eyebrow:  "Free plan",
        title:    "Community edition",
        subtitle: "Upgrade to unlock white-label, multi-workspace, team roles, and more.",
      }
    : {
        // active
        bg:       "bg-green-50",
        border:   "border-green-200",
        iconBg:   "bg-green-100",
        iconFg:   "text-green-600",
        accent:   "text-green-900",
        Icon:     ShieldCheck,
        eyebrow:  "License active",
        title:    `${planLabel(status.plan)} plan`,
        subtitle: status.expiresAt
          ? `Auto-renews on ${new Date(status.expiresAt).toLocaleDateString()}.`
          : "Lifetime license — no renewal needed.",
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
            {!isCommunity && (
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

        {/* Primary action — inline on right, only when there's room. Wraps
            below the meta on narrow viewports via flex-wrap on the parent. */}
        {isCommunity ? (
          <a
            href="https://launchtic.com/pricing"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gray-900 hover:bg-black text-white rounded-lg leading-none"
          >
            <span>View pricing</span>
            <ExternalLink size={11} />
          </a>
        ) : isOwner && (
          <button
            onClick={onOpenPortal}
            disabled={openingPortal}
            className={`shrink-0 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg disabled:opacity-60 leading-none ${
              isExpired
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-white hover:bg-gray-50 text-gray-700 border border-gray-200"
            }`}
          >
            {openingPortal ? <Loader2 size={11} className="animate-spin" /> : <ExternalLink size={11} />}
            <span>{isExpired ? "Resume billing" : "Manage subscription"}</span>
          </button>
        )}
      </div>

      {/* Affected-features list — expired only. Subtle: smaller text,
          divider above, no per-line icons (less visual noise). */}
      {isExpired && (
        <div className={`mt-3 pt-3 border-t ${variant.border} text-[11px] ${variant.accent} opacity-70 leading-relaxed`}>
          <strong className="font-medium">Reverted features:</strong>{" "}
          white-label branding · multi-workspace · team roles · premium templates · &quot;Powered by launchtic&quot; badge re-appears in funnel pages &amp; emails.
        </div>
      )}
    </div>
  );
}
