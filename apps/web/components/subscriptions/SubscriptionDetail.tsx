"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import {
  ChevronRight, ChevronLeft, ExternalLink, Loader2, Repeat,
  CheckCircle, Timer, Ban, AlertCircle, Clock, Ticket, XCircle, RotateCcw,
} from "lucide-react";
import { useRole } from "../../lib/role";
import { apiFetch } from "../../lib/api-client";

type Contact = {
  id: string; email: string;
  firstName: string | null; lastName: string | null;
  phone: string | null; country: string | null;
};
type FunnelStep = { name: string; funnel: { id: string; name: string } };
type StepPricePlan = {
  id: string; name: string; type: string;
  amount: number; currency: string;
  interval: string | null; trialDays: number | null;
};
type OrderSummary = {
  id: string; status: string; total: number; currency: string;
  invoiceId: string | null; isRenewal: boolean; createdAt: string;
  orderItemSnapshot: any | null;
};
type Subscription = {
  id: string;
  status: string;
  paymentProvider: string;
  providerSubId: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialEnd: string | null;
  cancelAtPeriodEnd: boolean;
  planSnapshot: {
    planName?: string | null;
    amount?: number | null;
    finalAmount?: number | null;
    currency?: string | null;
    interval?: string | null;
    trialDays?: number | null;
  } | null;
  createdAt: string;
  updatedAt: string;
  contact: Contact;
  funnelStep: FunnelStep | null;
  stepPricePlan: StepPricePlan | null;
  orders: OrderSummary[];
};

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  ACTIVE:     { label: "Active",     className: "bg-green-50 text-green-700 border-green-200",  icon: <CheckCircle size={13} /> },
  TRIALING:   { label: "Trial",      className: "bg-blue-50 text-blue-700 border-blue-200",     icon: <Timer size={13} /> },
  PAST_DUE:   { label: "Past due",   className: "bg-red-50 text-red-700 border-red-200",        icon: <AlertCircle size={13} /> },
  CANCELED:   { label: "Canceled",   className: "bg-gray-50 text-gray-600 border-gray-200",     icon: <Ban size={13} /> },
  INCOMPLETE: { label: "Incomplete", className: "bg-amber-50 text-amber-700 border-amber-200",  icon: <Clock size={13} /> },
};

const ORDER_STATUS_STYLE: Record<string, string> = {
  PAID:     "bg-green-50 text-green-700 border-green-200",
  TRIAL:    "bg-blue-50 text-blue-700 border-blue-200",
  PENDING:  "bg-amber-50 text-amber-700 border-amber-200",
  FAILED:   "bg-red-50 text-red-700 border-red-200",
  REFUNDED: "bg-purple-50 text-purple-700 border-purple-200",
  CANCELED: "bg-gray-50 text-gray-600 border-gray-200",
};

function formatAmount(amount: number | null | undefined, currency: string | null | undefined) {
  if (amount == null) return "—";
  return (amount / 100).toLocaleString("en-US", {
    style: "currency",
    currency: (currency ?? "usd").toUpperCase(),
  });
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{children}</p>;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="text-gray-400 w-24 shrink-0 pt-0.5">{label}</span>
      <span className="text-gray-700 break-all">{value}</span>
    </div>
  );
}

function CancelModal({
  sub, onClose, onDone,
}: {
  sub: Subscription;
  onClose: () => void;
  onDone: (updates: Partial<Subscription>) => void;
}) {
  const isTrialing = sub.status === "TRIALING";
  const isFree = sub.paymentProvider === "free";
  const forceImmediate = isTrialing || isFree;
  const [option, setOption] = useState<"period_end" | "immediate">(forceImmediate ? "immediate" : "period_end");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const periodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;

  async function doCancel() {
    const immediate = option === "immediate";
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/subscriptions/${sub.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ immediate }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Failed to cancel");
      onDone({
        status: json.data.canceledImmediately ? "CANCELED" : sub.status,
        cancelAtPeriodEnd: Boolean(json.data.cancelAtPeriodEnd),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to cancel");
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex flex-col items-center text-center mb-4">
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
              <XCircle size={22} className="text-red-500" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 mb-1.5">Cancel subscription?</h2>
            <p className="text-sm text-gray-500">
              Contact: <span className="font-medium text-gray-700">{sub.contact.email}</span>
            </p>
          </div>

          {forceImmediate ? (
            <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 mb-4">
              <p className="text-sm text-blue-900">
                {isTrialing
                  ? <>This subscription is in <strong>trial</strong>. Canceling will take effect immediately — no charge has been made.</>
                  : <>This is a <strong>free</strong> subscription (100% discount). Canceling will revoke access immediately.</>}
              </p>
            </div>
          ) : (
            <div className="space-y-2 mb-4">
              <label
                className={`block w-full text-left p-3 rounded-xl border cursor-pointer transition-colors ${
                  option === "period_end"
                    ? "border-blue-400 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300"
                } ${submitting ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <input
                  type="radio"
                  name="cancel-option"
                  value="period_end"
                  checked={option === "period_end"}
                  onChange={() => setOption("period_end")}
                  disabled={submitting}
                  className="sr-only"
                />
                <p className="text-sm font-medium text-gray-900">Cancel at period end (recommended)</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Contact keeps access until {periodEnd ? periodEnd.toLocaleDateString() : "period end"}. No more charges after that.
                </p>
              </label>
              <label
                className={`block w-full text-left p-3 rounded-xl border cursor-pointer transition-colors ${
                  option === "immediate"
                    ? "border-red-400 bg-red-50"
                    : "border-gray-200 hover:border-gray-300"
                } ${submitting ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <input
                  type="radio"
                  name="cancel-option"
                  value="immediate"
                  checked={option === "immediate"}
                  onChange={() => setOption("immediate")}
                  disabled={submitting}
                  className="sr-only"
                />
                <p className="text-sm font-medium text-red-700">Cancel immediately</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Access revoked now. No refund is issued automatically.
                </p>
              </label>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 mb-3">{error}</p>
          )}

          <div className="flex gap-2">
            <button
              disabled={submitting}
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-50"
            >
              Keep subscription
            </button>
            <button
              disabled={submitting}
              onClick={doCancel}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              Confirm cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResumeModal({
  sub, onClose, onDone,
}: {
  sub: Subscription;
  onClose: () => void;
  onDone: (updates: Partial<Subscription>) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const periodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;

  async function doResume() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/subscriptions/${sub.id}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Failed to resume");
      onDone({ cancelAtPeriodEnd: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to resume");
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex flex-col items-center text-center mb-4">
            <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mb-4">
              <RotateCcw size={22} className="text-green-600" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 mb-1.5">Resume subscription?</h2>
            <p className="text-sm text-gray-500">
              Contact: <span className="font-medium text-gray-700">{sub.contact.email}</span>
            </p>
          </div>

          <div className="rounded-xl bg-green-50 border border-green-100 p-3 mb-4">
            <p className="text-sm text-green-900">
              Billing will continue as normal. The next charge will be on{" "}
              <strong>{periodEnd ? periodEnd.toLocaleDateString() : "the next renewal date"}</strong>.
            </p>
          </div>

          {error && (
            <p className="text-xs text-red-600 mb-3">{error}</p>
          )}

          <div className="flex gap-2">
            <button
              disabled={submitting}
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-50"
            >
              Keep canceling
            </button>
            <button
              disabled={submitting}
              onClick={doResume}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              Resume
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SubscriptionDetail({ subscription: initial }: { subscription: Subscription }) {
  const [sub, setSub] = useState(initial);
  const [showCancel, setShowCancel] = useState(false);
  const [showResume, setShowResume] = useState(false);
  const [mobileView, setMobileView] = useState<"info" | "orders">("info");
  const router = useRouter();
  const params = useParams();
  const slug = params.workspaceSlug as string;
  const { canManageSettings } = useRole();

  const contactName = [sub.contact.firstName, sub.contact.lastName].filter(Boolean).join(" ") || sub.contact.email;
  const shortId = sub.id.slice(-8).toUpperCase();
  const cfg = STATUS_CONFIG[sub.status] ?? { label: sub.status, className: "bg-gray-50 text-gray-600 border-gray-200", icon: null };
  const amount = sub.planSnapshot?.finalAmount ?? sub.planSnapshot?.amount ?? sub.stepPricePlan?.amount ?? null;
  const originalAmount = sub.planSnapshot?.amount ?? null;
  const hasDiscount = originalAmount != null && amount != null && originalAmount !== amount;
  const currency = sub.planSnapshot?.currency ?? sub.stepPricePlan?.currency ?? "usd";
  const interval = sub.planSnapshot?.interval ?? sub.stepPricePlan?.interval ?? null;
  const canCancel = sub.status !== "CANCELED" && !sub.cancelAtPeriodEnd;
  const canResume = sub.status !== "CANCELED" && sub.cancelAtPeriodEnd;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel */}
      <div className={`
        w-full md:w-96 md:shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-y-auto
        ${mobileView === "info" ? "flex" : "hidden md:flex"}
      `}>
        <div className="px-5 py-4 border-b border-gray-100">
          <nav className="flex items-center gap-1 text-xs text-gray-400 mb-3">
            <Link href={`/${slug}/subscriptions`} className="hover:text-blue-600">Subscriptions</Link>
            <ChevronRight size={11} />
            <span className="text-gray-700 font-medium font-mono">#{shortId}</span>
          </nav>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border ${cfg.className}`}>
                {cfg.icon}
                {cfg.label}
              </span>
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 capitalize">
                {sub.paymentProvider}
              </span>
              {sub.cancelAtPeriodEnd && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200">
                  Ends at period end
                </span>
              )}
            </div>

            <button
              onClick={() => setMobileView("orders")}
              className="md:hidden flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors shrink-0"
            >
              <Ticket size={12} /> Orders ({sub.orders.length})
            </button>
          </div>
        </div>

        {/* Plan */}
        <div className="px-5 py-4 border-b border-gray-100 space-y-2">
          <SectionLabel>Plan</SectionLabel>
          <p className="text-sm font-semibold text-gray-900">{sub.planSnapshot?.planName ?? sub.stepPricePlan?.name ?? "—"}</p>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-gray-900">{formatAmount(amount, currency)}</span>
            {interval && <span className="text-xs text-gray-500">/{interval}</span>}
            {hasDiscount && originalAmount != null && (
              <span className="text-xs text-gray-400 line-through">{formatAmount(originalAmount, currency)}</span>
            )}
          </div>
          {sub.planSnapshot?.trialDays && (
            <p className="text-xs text-blue-600">{sub.planSnapshot.trialDays}-day trial</p>
          )}
        </div>

        {/* Billing */}
        <div className="px-5 py-4 border-b border-gray-100 space-y-2">
          <SectionLabel>Billing</SectionLabel>
          {sub.trialEnd && (
            <Row label="Trial ends" value={new Date(sub.trialEnd).toLocaleString()} />
          )}
          {sub.currentPeriodStart && (
            <Row label="Period start" value={new Date(sub.currentPeriodStart).toLocaleString()} />
          )}
          {sub.currentPeriodEnd && (
            <Row label="Period end" value={new Date(sub.currentPeriodEnd).toLocaleString()} />
          )}
          <Row label="Provider" value={<span className="capitalize">{sub.paymentProvider}</span>} />
          <Row label="Provider ID" value={<span className="font-mono text-gray-500">{sub.providerSubId}</span>} />
        </div>

        {/* Contact */}
        <div className="px-5 py-4 border-b border-gray-100">
          <SectionLabel>Contact</SectionLabel>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
              <span className="text-blue-700 text-sm font-bold">
                {(sub.contact.firstName?.[0] ?? sub.contact.email[0]).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 truncate">{contactName}</p>
              <p className="text-xs text-gray-400 truncate">{sub.contact.email}</p>
            </div>
            <Link href={`/${slug}/contacts/${sub.contact.id}`} className="text-gray-400 hover:text-blue-600 transition-colors shrink-0">
              <ExternalLink size={14} />
            </Link>
          </div>
        </div>

        {/* Funnel */}
        {sub.funnelStep && (
          <div className="px-5 py-4 border-b border-gray-100">
            <SectionLabel>Funnel</SectionLabel>
            <p className="text-sm text-gray-700 font-medium">{sub.funnelStep.funnel.name}</p>
            <p className="text-xs text-gray-500 mt-0.5">{sub.funnelStep.name}</p>
          </div>
        )}

        {/* Actions */}
        <div className="px-5 py-4 mt-auto flex items-center gap-2">
          {canCancel && canManageSettings && (
            <button
              onClick={() => setShowCancel(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded-xl transition-colors"
            >
              <XCircle size={12} /> Cancel subscription
            </button>
          )}
          {canResume && canManageSettings && (
            <button
              onClick={() => setShowResume(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-green-700 border border-green-200 hover:bg-green-50 rounded-xl transition-colors"
            >
              <RotateCcw size={12} /> Resume subscription
            </button>
          )}
        </div>
      </div>

      {/* Right panel — orders */}
      <div className={`
        flex-1 flex flex-col overflow-hidden bg-gray-50
        ${mobileView === "orders" ? "flex" : "hidden md:flex"}
      `}>
        <div className="md:hidden flex items-center gap-2 px-4 py-3 bg-white border-b border-gray-200 shrink-0">
          <button
            onClick={() => setMobileView("info")}
            className="p-1.5 -ml-1 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-medium text-gray-900">Orders</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Orders · {sub.orders.length}
          </p>

          {sub.orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Repeat size={32} className="text-gray-200 mb-3" />
              <p className="text-sm text-gray-400">No orders yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sub.orders.map((o) => {
                const orderCls = ORDER_STATUS_STYLE[o.status] ?? "bg-gray-50 text-gray-600 border-gray-200";
                return (
                  <Link
                    key={o.id}
                    href={`/${slug}/orders/${o.id}`}
                    className="block bg-white rounded-xl border border-gray-100 px-4 py-3 hover:border-blue-200 hover:bg-blue-50/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-800 font-mono">#{o.id.slice(-8).toUpperCase()}</p>
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${orderCls}`}>
                            {o.status}
                          </span>
                          {o.isRenewal && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                              Renewal
                            </span>
                          )}
                        </div>
                        {o.invoiceId && (
                          <p className="text-[10px] font-mono text-gray-400 mt-0.5 truncate">{o.invoiceId}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-gray-900">{formatAmount(o.total, o.currency)}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{new Date(o.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showCancel && (
        <CancelModal
          sub={sub}
          onClose={() => setShowCancel(false)}
          onDone={(updates) => {
            setSub((prev) => ({ ...prev, ...updates }));
            setShowCancel(false);
            router.refresh();
          }}
        />
      )}

      {showResume && (
        <ResumeModal
          sub={sub}
          onClose={() => setShowResume(false)}
          onDone={(updates) => {
            setSub((prev) => ({ ...prev, ...updates }));
            setShowResume(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
