"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import {
  ChevronRight, ExternalLink, Loader2,
  CheckCircle, Clock, XCircle, RotateCcw, Ban,
  FileText,
} from "lucide-react";
import { useRole } from "../../lib/role";

type Contact = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  country: string | null;
};
type FunnelStep = { name: string; funnel: { id: string; name: string } };
type StepPricePlan = { name: string; type: string };
type ShippingAddress = {
  line1?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
};
type BumpItem = {
  orderBumpId: string;
  planId: string | null;
  physicalProductId: string | null;
  productName: string | null;
  planName?: string | null;
  name: string;
  unitPrice: number;
  shippingFee: number;
  total: number;
  currency: string;
};

type Order = {
  id: string;
  contactId: string;
  funnelStepId: string | null;
  stepPricePlanId: string | null;
  status: string;
  paymentProvider: string;
  providerOrderId: string | null;
  subtotal: number;
  discountAmount: number;
  shippingFee: number;
  total: number;
  currency: string;
  quantity: number;
  variantId: string | null;
  physicalProductId: string | null;
  refundAmount: number;
  refundedAt: string | null;
  isRenewal: boolean;
  orderItemSnapshot: {
    productName?: string | null;
    variantName?: string | null;
    sku?: string | null;
    unitPrice?: number | null;
    planName?: string | null;
    planType?: string | null;
  } | null;
  bumpItems: BumpItem[] | null;
  shippingAddress: ShippingAddress | null;
  createdAt: string;
  updatedAt: string;
  contact: Contact;
  funnelStep: FunnelStep | null;
  stepPricePlan: StepPricePlan | null;
};

const STATUS_CONFIG: Record<string, { className: string; icon: React.ReactNode }> = {
  PAID:     { className: "bg-green-50 text-green-700 border-green-200",     icon: <CheckCircle size={13} /> },
  PENDING:  { className: "bg-amber-50 text-amber-700 border-amber-200",     icon: <Clock size={13} /> },
  FAILED:   { className: "bg-red-50 text-red-700 border-red-200",           icon: <XCircle size={13} /> },
  REFUNDED: { className: "bg-purple-50 text-purple-700 border-purple-200",  icon: <RotateCcw size={13} /> },
  CANCELED: { className: "bg-gray-50 text-gray-600 border-gray-200",        icon: <Ban size={13} /> },
};

function formatAmount(amount: number, currency: string) {
  return (amount / 100).toLocaleString("en-US", { style: "currency", currency: currency.toUpperCase() });
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{children}</p>;
}

function FinancialRow({ label, value, bold, tone }: { label: string; value: string; bold?: boolean; tone?: "default" | "refund" }) {
  const toneCls = tone === "refund" ? "text-orange-700" : "";
  return (
    <div className={`flex items-center justify-between text-sm ${bold ? "font-semibold text-gray-900" : "text-gray-600"} ${toneCls}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function RefundModal({
  order, onClose, onDone,
}: {
  order: Order;
  onClose: () => void;
  onDone: (updates: Partial<Order>) => void;
}) {
  const remaining = order.total - order.refundAmount;
  const [amountInput, setAmountInput] = useState((remaining / 100).toFixed(2));
  const [reason, setReason] = useState<"" | "duplicate" | "fraudulent" | "requested_by_customer">("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = parseFloat(amountInput);
  const amountCents = Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
  const amountInvalid = !Number.isFinite(parsed) || amountCents <= 0 || amountCents > remaining;

  async function doRefund() {
    if (amountInvalid) {
      setError(`Amount must be between 0 and ${formatAmount(remaining, order.currency)}`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${order.id}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amountCents,
          ...(reason && { reason }),
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Refund failed");
      onDone({
        refundAmount: json.data.refundAmount,
        status: json.data.status,
        refundedAt: new Date().toISOString(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refund failed");
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
            <div className="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center mb-4">
              <RotateCcw size={22} className="text-orange-600" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 mb-1.5">Issue a Refund</h2>
            <p className="text-sm text-gray-500">
              Order <span className="font-medium text-gray-700 font-mono">#{order.id.slice(-8).toUpperCase()}</span>
            </p>
          </div>

          <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 mb-4 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Total paid</span>
              <span className="font-medium text-gray-900">{formatAmount(order.total, order.currency)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Already refunded</span>
              <span className="font-medium text-gray-900">{formatAmount(order.refundAmount, order.currency)}</span>
            </div>
            <div className="flex items-center justify-between text-xs border-t border-gray-200 pt-1 mt-1">
              <span className="text-gray-500">Remaining refundable</span>
              <span className="font-semibold text-gray-900">{formatAmount(remaining, order.currency)}</span>
            </div>
          </div>

          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Amount</label>
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                onBlur={() => {
                  if (Number.isFinite(parsed)) setAmountInput(parsed.toFixed(2));
                }}
                placeholder="0.00"
                disabled={submitting}
                className={`w-full pl-3 pr-14 py-2 text-sm border rounded-xl focus:outline-none focus:ring-2 bg-white disabled:opacity-50 ${
                  amountInvalid && amountInput !== ""
                    ? "border-red-300 focus:ring-red-400"
                    : "border-gray-200 focus:ring-blue-500"
                }`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 uppercase">
                {order.currency}
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              Max: {formatAmount(remaining, order.currency)}
            </p>
          </div>

          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Reason <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as typeof reason)}
              disabled={submitting}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:opacity-50"
            >
              <option value="">Not specified</option>
              <option value="duplicate">Duplicate</option>
              <option value="fraudulent">Fraudulent</option>
              <option value="requested_by_customer">Requested by customer</option>
            </select>
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
              Keep Order
            </button>
            <button
              disabled={submitting || amountInvalid}
              onClick={doRefund}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              Confirm Refund
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OrderDetail({ order: initial }: { order: Order }) {
  const [order, setOrder] = useState(initial);
  const [showRefund, setShowRefund] = useState(false);
  const router = useRouter();
  const params = useParams();
  const slug = params.workspaceSlug as string;
  const { canManageSettings } = useRole();

  const contactName = [order.contact.firstName, order.contact.lastName].filter(Boolean).join(" ") || order.contact.email;
  const shortId = order.id.slice(-8).toUpperCase();

  const statusCfg = STATUS_CONFIG[order.status] ?? { className: "bg-gray-50 text-gray-600 border-gray-200", icon: null };
  const snapshot = order.orderItemSnapshot;
  const hasItem = snapshot && (snapshot.productName || snapshot.planName);
  const bumpItems = Array.isArray(order.bumpItems) && order.bumpItems.length > 0 ? order.bumpItems : null;
  const refundRemaining = order.total - order.refundAmount;
  const canRefund = order.status === "PAID"
    && (order.paymentProvider === "stripe" || order.paymentProvider === "paypal")
    && refundRemaining > 0;
  const hasPartialRefund = order.refundAmount > 0 && order.status !== "REFUNDED";
  const hasShipping =
    order.shippingAddress &&
    (order.shippingAddress.line1 ||
      order.shippingAddress.city ||
      order.shippingAddress.state ||
      order.shippingAddress.postal_code ||
      order.shippingAddress.country);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">
      {/* Header bar */}
      <header className="px-4 sm:px-6 py-4 shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="min-w-0">
            <nav className="flex items-center gap-1 text-xs text-gray-400 mb-1.5">
              <Link href={`/${slug}/orders`} className="hover:text-blue-600">Orders</Link>
              <ChevronRight size={11} />
              <span className="text-gray-700 font-medium font-mono">#{shortId}</span>
            </nav>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-gray-900">Order #{shortId}</h1>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusCfg.className}`}>
                {statusCfg.icon}
                {order.status.charAt(0) + order.status.slice(1).toLowerCase()}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 capitalize">
                {order.paymentProvider}
              </span>
              {hasPartialRefund && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200">
                  <RotateCcw size={10} />
                  Partial refund: {formatAmount(order.refundAmount, order.currency)}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Created {new Date(order.createdAt).toLocaleString()}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <a
              href={`/api/orders/${order.id}/invoice`}
              target="_blank"
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-blue-600 border border-blue-200 hover:bg-blue-50 rounded-xl transition-colors"
            >
              <FileText size={12} /> Export PDF
            </a>
            {canRefund && canManageSettings && (
              <button
                onClick={() => setShowRefund(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-orange-700 border border-orange-200 hover:bg-orange-50 rounded-xl transition-colors"
              >
                <RotateCcw size={12} /> Refund
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Content grid */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Main column — Item + Financials */}
          <div className="lg:col-span-2 space-y-4 sm:space-y-6">
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              {/* Item section — includes main item and order bumps */}
              {(hasItem || bumpItems) && (
                <div className="p-5 border-b border-gray-100">
                  <SectionLabel>Item</SectionLabel>

                  {hasItem && (
                    <div className="space-y-1">
                      {snapshot!.productName && (
                        <p className="text-sm font-medium text-gray-800">{snapshot!.productName}</p>
                      )}
                      {snapshot!.planName && (
                        <p className="text-sm font-medium text-gray-800">{snapshot!.planName}</p>
                      )}
                      {snapshot!.variantName && (
                        <p className="text-xs text-gray-500">{snapshot!.variantName}</p>
                      )}
                      {snapshot!.sku && (
                        <p className="text-xs font-mono text-gray-400">SKU: {snapshot!.sku}</p>
                      )}
                      {snapshot!.planType && (
                        <p className="text-xs text-gray-400 capitalize">
                          {snapshot!.planType.replace("_", " ").toLowerCase()}
                        </p>
                      )}
                    </div>
                  )}

                  {bumpItems && (
                    <div className={`space-y-3 ${hasItem ? "mt-4 pt-4 border-t border-gray-100" : ""}`}>
                      {bumpItems.map((bump, i) => (
                        <div key={bump.orderBumpId ?? i} className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-800">
                              {bump.productName ?? bump.planName}
                            </p>
                            {bump.productName && bump.name !== bump.productName && (
                              <p className="text-xs text-gray-400">{bump.name}</p>
                            )}
                          </div>
                          <p className="text-sm font-medium text-gray-700 shrink-0">
                            {formatAmount(bump.total, bump.currency)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="p-5 space-y-2">
                <SectionLabel>Financials</SectionLabel>
                {snapshot?.unitPrice != null && (
                  <FinancialRow label="Unit price" value={formatAmount(snapshot.unitPrice, order.currency)} />
                )}
                {order.quantity > 1 && (
                  <FinancialRow label={`Quantity: ${order.quantity}`} value="" />
                )}
                <FinancialRow label="Subtotal" value={formatAmount(order.subtotal, order.currency)} />
                {bumpItems?.map((bump, i) => (
                  <div key={bump.orderBumpId ?? i}>
                    <FinancialRow
                      label={`Bump: ${bump.productName ?? bump.planName ?? ""}`}
                      value={formatAmount(bump.unitPrice, bump.currency)}
                    />
                    {bump.shippingFee > 0 && (
                      <FinancialRow
                        label="Bump shipping"
                        value={formatAmount(bump.shippingFee, bump.currency)}
                      />
                    )}
                  </div>
                ))}
                {order.discountAmount > 0 && (
                  <FinancialRow label="Discount" value={`-${formatAmount(order.discountAmount, order.currency)}`} />
                )}
                {order.shippingFee > 0 && (
                  <FinancialRow label="Shipping" value={formatAmount(order.shippingFee, order.currency)} />
                )}
                <div className="border-t border-gray-100 pt-3 mt-3">
                  <FinancialRow label="Total" value={formatAmount(order.total, order.currency)} bold />
                </div>
                {order.refundAmount > 0 && (
                  <div className="border-t border-gray-100 pt-3 mt-3 space-y-2">
                    <FinancialRow
                      label="Refunded"
                      value={`-${formatAmount(order.refundAmount, order.currency)}`}
                      tone="refund"
                    />
                    <FinancialRow
                      label="Net amount"
                      value={formatAmount(order.total - order.refundAmount, order.currency)}
                      bold
                    />
                    {order.refundedAt && (
                      <p className="text-xs text-gray-400 pt-1">
                        Last refund: {new Date(order.refundedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Side column */}
          <div className="space-y-4 sm:space-y-6">
            {/* Contact */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <SectionLabel>Contact</SectionLabel>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                  <span className="text-blue-700 text-sm font-bold">
                    {(order.contact.firstName?.[0] ?? order.contact.email[0]).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 truncate">{contactName}</p>
                  <p className="text-xs text-gray-400 truncate">{order.contact.email}</p>
                </div>
                <Link
                  href={`/${slug}/contacts/${order.contact.id}`}
                  className="text-gray-400 hover:text-blue-600 transition-colors shrink-0"
                >
                  <ExternalLink size={14} />
                </Link>
              </div>
              {(order.contact.phone || order.contact.country) && (
                <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
                  {order.contact.phone && (
                    <p className="text-xs text-gray-500">{order.contact.phone}</p>
                  )}
                  {order.contact.country && (
                    <p className="text-xs text-gray-500">{order.contact.country}</p>
                  )}
                </div>
              )}
            </div>

            {/* Funnel */}
            {order.funnelStep && (
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <SectionLabel>Funnel</SectionLabel>
                <p className="text-sm text-gray-700 font-medium">{order.funnelStep.funnel.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{order.funnelStep.name}</p>
                {order.stepPricePlan && (
                  <p className="text-xs text-gray-400 mt-1">
                    {order.stepPricePlan.name} · {order.stepPricePlan.type}
                  </p>
                )}
              </div>
            )}

            {/* Shipping */}
            {hasShipping && (
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <SectionLabel>Shipping Address</SectionLabel>
                <div className="text-sm text-gray-600 space-y-0.5">
                  {order.shippingAddress!.line1 && <p>{order.shippingAddress!.line1}</p>}
                  {(order.shippingAddress!.city || order.shippingAddress!.state || order.shippingAddress!.postal_code) && (
                    <p>
                      {[order.shippingAddress!.city, order.shippingAddress!.state, order.shippingAddress!.postal_code]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  )}
                  {order.shippingAddress!.country && <p>{order.shippingAddress!.country}</p>}
                </div>
              </div>
            )}

            {/* Metadata */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-2">
              <SectionLabel>Metadata</SectionLabel>
              {order.variantId && (
                <div className="flex items-start gap-2 text-xs">
                  <span className="text-gray-400 w-20 shrink-0 pt-0.5">Variant</span>
                  <span className="font-mono text-gray-500 break-all">{order.variantId}</span>
                </div>
              )}
              {order.providerOrderId && (
                <div className="flex items-start gap-2 text-xs">
                  <span className="text-gray-400 w-20 shrink-0 pt-0.5">Provider ID</span>
                  <span className="font-mono text-gray-600 break-all">{order.providerOrderId}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-400 w-20 shrink-0">Updated</span>
                <span className="text-gray-600">{new Date(order.updatedAt).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showRefund && (
        <RefundModal
          order={order}
          onClose={() => setShowRefund(false)}
          onDone={(updates) => {
            setOrder((prev) => ({ ...prev, ...updates }));
            setShowRefund(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
