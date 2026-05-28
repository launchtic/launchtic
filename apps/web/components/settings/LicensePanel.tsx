"use client";

import { useState, useEffect } from "react";
import { XCircle, Loader2, ExternalLink, ShieldCheck, ShieldOff, Sparkles } from "lucide-react";
import { apiFetch } from "../../lib/api-client";
import { planLabel, planColor } from "../../lib/plan";
import { useRole } from "../../lib/role";

type LicenseStatus = {
  plan: string | null;          // null = no valid license (locked)
  licenseKey: string | null;
  expiresAt: string | null;     // free-updates deadline, not an access cutoff
  updatesCurrent: boolean;      // false = updates lapsed (renew optional; features stay on)
};

export default function LicensePanel() {
  const { isOwner } = useRole();
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  // Plan color + label come from the shared helper. Enum values (SOLO/
  // STARTER/AGENCY/CUSTOM) are the same names the operator sees in the UI —
  // no mapping layer. A null plan = locked (no valid license).

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 size={14} className="animate-spin" /> Loading...
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="text-base font-semibold text-gray-900">License</h2>
        <p className="text-sm text-gray-500 mt-1">
          Your license and plan for this instance. Activation happens automatically at install.
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
          here (not inside the hero) so the hero stays stable in size. */}
      {error && (
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

  // Perpetual license model: three states.
  //   locked         — no valid license → get a license
  //   updates lapsed — license valid forever, but free-updates window ended
  //                    (features stay ON; renewing only resumes new updates)
  //   active         — licensed + updates current
  const isLocked       = !status.plan;
  const updatesLapsed  = !isLocked && !status.updatesCurrent;

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
    : updatesLapsed ? {
        bg:       "bg-amber-50",
        border:   "border-amber-200",
        iconBg:   "bg-amber-100",
        iconFg:   "text-amber-600",
        accent:   "text-amber-900",
        Icon:     Sparkles,
        eyebrow:  "Updates ended",
        title:    `${planLabel(status.plan)} plan`,
        subtitle: status.expiresAt
          ? `Free updates ended ${new Date(status.expiresAt).toLocaleDateString()}. Your license stays active forever — renew to get new updates.`
          : "Your license stays active forever — renew to get new updates.",
      }
    : {
        // active + updates current
        bg:       "bg-green-50",
        border:   "border-green-200",
        iconBg:   "bg-green-100",
        iconFg:   "text-green-600",
        accent:   "text-green-900",
        Icon:     ShieldCheck,
        eyebrow:  "License active",
        title:    `${planLabel(status.plan)} plan`,
        subtitle: status.expiresAt
          ? `Free updates included until ${new Date(status.expiresAt).toLocaleDateString()}.`
          : "Perpetual license — yours forever.",
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

        {/* Primary action — inline on right, only when there's room. Wraps
            below the meta on narrow viewports via flex-wrap on the parent. */}
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
        ) : updatesLapsed ? (
          <a
            href="https://launchtic.com/account"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg leading-none"
          >
            <span>Renew updates</span>
            <ExternalLink size={11} />
          </a>
        ) : isOwner && (
          <button
            onClick={onOpenPortal}
            disabled={openingPortal}
            className="shrink-0 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg disabled:opacity-60 leading-none bg-white hover:bg-gray-50 text-gray-700 border border-gray-200"
          >
            {openingPortal ? <Loader2 size={11} className="animate-spin" /> : <ExternalLink size={11} />}
            <span>Manage license</span>
          </button>
        )}
      </div>
      {/* No "reverted features" block — under the perpetual model nothing is
          revoked when the update window ends; the tier's features stay on. */}
    </div>
  );
}
