"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Check, X, Circle, ChevronDown, ChevronUp, Rocket } from "lucide-react";
import { useConfirm } from "../ui/ConfirmDialog";
import type { OnboardingStatus, OnboardingItem } from "../../lib/onboarding";
import { apiFetch } from "../../lib/api-client";

// Floating "Getting Started" guide pinned bottom-right.
//
// Two minimization levels:
//   - Expanded panel (default first visit): full list with active item open.
//   - Collapsed pill: small chip showing progress + label, click to expand.
//
// Collapse state persists in localStorage (per-browser UX preference).
// Dismiss (✕) hits the server endpoint and hides forever via DB flag.

const COLLAPSE_KEY = "onboarding-collapsed";

export default function OnboardingChecklist({ status }: { status: OnboardingStatus }) {
  const params = useParams();
  const slug = params.workspaceSlug as string;

  const firstPendingKey = status.items.find((i) => !i.done)?.key ?? null;
  const [expandedKey, setExpandedKey] = useState<OnboardingItem["key"] | null>(firstPendingKey);
  // Default collapsed — the pill is a gentle nudge, not an interruption.
  // Operators who care expand it explicitly; localStorage then remembers
  // their preference (so a power user who keeps it open doesn't have to
  // re-open it every navigation).
  const [collapsed, setCollapsed]     = useState(true);
  const [hidden, setHidden]           = useState(false);
  const [pending, startDismiss]       = useTransition();
  const confirm = useConfirm();

  // Load collapse preference once on mount. Only override the default-true
  // when the user has explicitly chosen "expanded" (stored as "0").
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(COLLAPSE_KEY);
    if (stored === "0") setCollapsed(false);
  }, []);

  if (hidden || status.isComplete || status.isDismissed) return null;

  const percent = Math.round((status.completed / status.total) * 100);

  function toggleCollapse() {
    setCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0"); } catch {}
      return next;
    });
  }

  async function dismiss() {
    const ok = await confirm({
      title: "Dismiss the setup guide?",
      description: "You won't see this checklist again. The same actions are still accessible from Settings.",
      confirmLabel: "Dismiss",
      variant: "warning",
    });
    if (!ok) return;

    setHidden(true);
    startDismiss(async () => {
      try {
        await apiFetch("/api/onboarding/dismiss", { method: "POST" });
      } catch {
        setHidden(false); // re-show on failure
      }
    });
  }

  function toggleItem(key: OnboardingItem["key"]) {
    setExpandedKey(expandedKey === key ? null : key);
  }

  const positionClass = "bottom-5";

  // ─── Collapsed pill ──────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <button
        onClick={toggleCollapse}
        className={`fixed ${positionClass} right-5 z-50 hidden md:flex items-center gap-2 pl-3 pr-3.5 py-2 rounded-full bg-white border border-gray-200 shadow-lg hover:shadow-xl transition-shadow group`}
        aria-label="Expand onboarding checklist"
      >
        <span className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
          <Rocket size={12} className="text-blue-600" />
        </span>
        <span className="text-xs font-medium text-gray-900">Get started</span>
        <span className="text-xs text-gray-400">{status.completed}/{status.total}</span>
        <ChevronUp size={13} className="text-gray-400 group-hover:text-gray-600" />
      </button>
    );
  }

  // ─── Expanded panel ──────────────────────────────────────────────────────
  return (
    <div className={`fixed ${positionClass} right-5 z-50 w-80 hidden md:block`}>
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-start gap-2 px-4 py-3 border-b border-gray-100">
          <span className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
            <Rocket size={14} className="text-blue-600" />
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-gray-900">Getting Started Guide</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {status.completed} of {status.total} complete
            </p>
          </div>
          <button
            onClick={toggleCollapse}
            className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors shrink-0"
            aria-label="Collapse"
            title="Collapse"
          >
            <ChevronDown size={15} />
          </button>
          <button
            onClick={dismiss}
            disabled={pending}
            className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors disabled:opacity-50 shrink-0"
            aria-label="Dismiss"
            title="Dismiss permanently"
          >
            <X size={15} />
          </button>
        </div>

        {/* Progress bar — flush below header */}
        <div className="h-0.5 bg-gray-100">
          <div
            className="h-full bg-blue-500 transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>

        {/* Items */}
        <ul className="divide-y divide-gray-50 max-h-[60vh] overflow-y-auto">
          {status.items.map((item) => (
            <ChecklistRow
              key={item.key}
              item={item}
              slug={slug}
              expanded={expandedKey === item.key}
              onToggle={() => toggleItem(item.key)}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

function ChecklistRow({
  item,
  slug,
  expanded,
  onToggle,
}: {
  item:    OnboardingItem;
  slug:    string;
  expanded: boolean;
  onToggle: () => void;
}) {
  // /settings is now a parent route with per-tab sub-pages (/settings/email,
  // /settings/payment, /settings/ai) — replaces the legacy
  // /settings?tab=xxx query-param pattern.
  const href = item.tab
    ? `/${slug}/settings/${item.tab}`
    : `/${slug}/${item.route}`;

  return (
    <li>
      {/* Header row — click to toggle expand */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors"
      >
        {/* Status circle */}
        <span className="shrink-0">
          {item.done ? (
            <span className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
              <Check size={10} strokeWidth={3} className="text-white" />
            </span>
          ) : (
            <Circle size={16} className="text-gray-300" strokeWidth={1.75} />
          )}
        </span>

        {/* Label */}
        <span className={`flex-1 text-sm truncate ${item.done ? "text-gray-400 line-through" : "text-gray-800 font-medium"}`}>
          {item.label}
        </span>


        {/* Expand chevron — rotates when expanded */}
        <ChevronDown
          size={14}
          className={`text-gray-400 transition-transform shrink-0 ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {/* Expanded body — help text + primary CTA */}
      {expanded && (
        <div className="px-4 pb-3 pl-[42px]">
          <p className="text-xs text-gray-500 leading-relaxed mb-3">
            {item.help}
          </p>
          {!item.done && (
            <Link
              href={href}
              className="block w-full px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold text-center transition-colors"
            >
              {item.cta}
            </Link>
          )}
        </div>
      )}
    </li>
  );
}
