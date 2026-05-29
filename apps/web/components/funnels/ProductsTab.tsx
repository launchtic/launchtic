"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  Package, Trash2, Plus, Loader2, Pencil, X, Check, Tag,
  Ticket, ExternalLink, ChevronDown, ChevronUp, ShoppingBag, GraduationCap, Monitor,
} from "lucide-react";
import { useConfirm } from "../ui/ConfirmDialog";
import { apiFetch } from "../../lib/api-client";
import { useRole } from "../../lib/role";

// ─── Types ───────────────────────────────────────────────────────────────────

type StepPricePlan = {
  id: string; name: string; description: string | null; type: "ONE_TIME" | "SUBSCRIPTION";
  amount: number; currency: string; interval: string | null; trialDays: number | null;
};

type WorkspaceTag    = { id: string; name: string; color: string | null };
type PhysicalProduct = { id: string; name: string; price: number; currency: string; sku: string | null };
type StepResource    = { id: string; type: string; resourceId: string };

type Coupon = {
  id: string; code: string; type: "percentage" | "fixed";
  discount: number; maxUses: number | null; usedCount: number;
  expiresAt: string | null; active: boolean;
};

type PlanForm = {
  name: string; type: "ONE_TIME" | "SUBSCRIPTION";
  amount: string; interval: string; trialDays: string; description: string;
};

type OrderBumpPricePlan = {
  id: string; name: string; description: string | null; type: "ONE_TIME" | "SUBSCRIPTION";
  amount: number; currency: string; interval: string | null; trialDays: number | null;
};

type OrderBump = {
  id: string; label: string; headline: string | null;
  offerType: "DIGITAL" | "PHYSICAL" | null;
  physicalProductId: string | null; shippingFee: number; order: number;
  pricePlans: OrderBumpPricePlan[];
  resources: StepResource[];
};

// ─── Constants ───────────────────────────────────────────────────────────────

const EMPTY_PLAN: PlanForm = { name: "", type: "ONE_TIME", amount: "", interval: "month", trialDays: "", description: "" };

const TYPE_BADGE: Record<string, string> = {
  ONE_TIME: "bg-blue-50 text-blue-700",
  SUBSCRIPTION: "bg-green-50 text-green-700",
};
const TYPE_LABEL: Record<string, string> = {
  ONE_TIME: "One-time", SUBSCRIPTION: "Subscription",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPrice(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: currency.toUpperCase(), minimumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDiscount(c: Coupon, currency: string) {
  return c.type === "percentage" ? `${c.discount}% off` : formatPrice(c.discount, currency);
}

// ─── PlanFormRow ─────────────────────────────────────────────────────────────

function PlanFormRow({ initial, currency, onSave, onCancel, saving }: {
  initial: PlanForm; currency: string; onSave: (f: PlanForm) => void;
  onCancel: () => void; saving: boolean;
}) {
  const [form, setForm] = useState<PlanForm>(initial);
  const set = (k: keyof PlanForm, v: any) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="border border-blue-200 rounded-xl p-4 bg-blue-50/40 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Name</label>
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. One-time $97"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Type</label>
          <select
            className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={form.type}
            onChange={(e) => set("type", e.target.value as any)}
          >
            <option value="ONE_TIME">One-time</option>
            <option value="SUBSCRIPTION">Subscription</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Amount</label>
          <div className="flex">
            <span className="border border-r-0 rounded-l-lg px-3 py-2 text-sm bg-gray-50 text-gray-500 font-medium uppercase select-none">
              {currency}
            </span>
            <input
              type="number" min="0" step="0.01"
              className="flex-1 border rounded-r-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00" value={form.amount}
              onChange={(e) => set("amount", e.target.value)}
            />
          </div>
        </div>
        {form.type === "SUBSCRIPTION" && (
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Interval</label>
            <select
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.interval} onChange={(e) => set("interval", e.target.value)}
            >
              <option value="month">Monthly</option>
              <option value="year">Yearly</option>
            </select>
          </div>
        )}
      </div>
      {form.type === "SUBSCRIPTION" && (
        <div className="w-1/2">
          <label className="text-xs font-medium text-gray-500 mb-1 block">
            Trial days <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="number" min="0" max="365"
            className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="0" value={form.trialDays}
            onChange={(e) => {
              const v = e.target.value;
              const n = parseInt(v);
              if (v === "" || (n >= 0 && n <= 365)) set("trialDays", v);
            }}
          />
        </div>
      )}
      <div>
        <label className="text-xs font-medium text-gray-500 mb-1 block">
          Description <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="e.g. Most popular"
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="flex items-center gap-1 px-3 py-1.5 text-xs border rounded-lg hover:bg-gray-50">
          <X size={12} /> Cancel
        </button>
        <button
          onClick={() => onSave(form)}
          disabled={saving || !form.name.trim() || !form.amount}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          Save
        </button>
      </div>
    </div>
  );
}

// ─── OfferTypeSelector ───────────────────────────────────────────────────────

const OFFER_TYPES = [
  { value: "DIGITAL"  as const, label: "Digital",  icon: <Monitor size={13} /> },
  { value: "PHYSICAL" as const, label: "Physical", icon: <Package size={13} /> },
];

function OfferTypeSelector({ value, onChange, disabled }: {
  value: "DIGITAL" | "PHYSICAL" | null;
  onChange: (type: "DIGITAL" | "PHYSICAL") => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-1.5">
      {OFFER_TYPES.map(({ value: type, label, icon }) => (
        <button
          key={type}
          disabled={disabled}
          onClick={() => onChange(type)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-60 ${
            value === type
              ? "border-blue-600 bg-blue-50 text-blue-700"
              : "border-gray-200 text-gray-500 hover:border-gray-300 bg-white"
          }`}
        >
          {icon} {label}
        </button>
      ))}
    </div>
  );
}

// ─── ResourcesSection ────────────────────────────────────────────────────────

type ResourceTypeDef = { value: "TAG" | "COURSE"; label: string; badge: string; icon: React.ReactNode };

const RESOURCE_TYPE_DEFS: ResourceTypeDef[] = [
  { value: "TAG",    label: "Tag",    badge: "bg-purple-100 text-purple-700", icon: <Tag size={11} /> },
  { value: "COURSE", label: "Course", badge: "bg-blue-100 text-blue-700",    icon: <GraduationCap size={11} /> },
];

function getResourceLabel(r: StepResource, allTags: WorkspaceTag[]): string {
  if (r.type === "TAG") return allTags.find((t) => t.id === r.resourceId)?.name ?? r.resourceId;
  return "Course";
}

function ResourcesSection({ resources, allTags, onToggle, saving, perm }: {
  resources: StepResource[]; allTags: WorkspaceTag[];
  onToggle: (type: string, resourceId: string) => void; saving: boolean;
  perm: CrossDomainPerm;
}) {
  const slug = (useParams().workspaceSlug) as string;
  const [showAdd, setShowAdd]   = useState(false);
  const [type, setType]         = useState<"TAG" | "COURSE">("TAG");
  const [resourceId, setResourceId] = useState("");

  const availableTags = allTags.filter(
    (t) => !resources.some((r) => r.type === "TAG" && r.resourceId === t.id)
  );

  const canAdd = type === "TAG" ? !!resourceId : false;

  async function handleAdd() {
    if (!canAdd) return;
    await onToggle(type, resourceId);
    setResourceId("");
    setShowAdd(false);
  }

  function handleRemove(r: StepResource) {
    onToggle(r.type, r.resourceId);
  }

  function handleTypeChange(next: "TAG" | "COURSE") {
    setType(next);
    setResourceId("");
  }

  const typeDef = (v: string) => RESOURCE_TYPE_DEFS.find((d) => d.value === v)!;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900">Resources</h3>
          {resources.length > 0 && (
            <span className="bg-gray-100 text-gray-600 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
              {resources.length}
            </span>
          )}
          {saving && <Loader2 size={12} className="animate-spin text-gray-400" />}
        </div>
        {!showAdd && (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            <Plus size={12} /> Add
          </button>
        )}
      </div>
      <p className="text-xs text-gray-400 mb-3">
        Granted after purchase. Revoked on refund or cancellation.
      </p>

      {/* Added resources list */}
      {resources.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {resources.map((r) => {
            const def = typeDef(r.type);
            return (
              <div key={r.id} className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-xl">
                <span className={`flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${def.badge}`}>
                  {def.icon} {def.label}
                </span>
                <span className="flex-1 text-xs text-gray-700 truncate">{getResourceLabel(r, allTags)}</span>
                <button
                  onClick={() => handleRemove(r)} disabled={saving}
                  className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors disabled:opacity-40 shrink-0"
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="border border-blue-200 rounded-xl p-3 bg-blue-50/40 space-y-2">
          <div className="flex gap-2">
            {/* Type dropdown */}
            <select
              className="border rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 shrink-0"
              value={type}
              onChange={(e) => handleTypeChange(e.target.value as "TAG" | "COURSE")}
            >
              {RESOURCE_TYPE_DEFS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>

            {/* Resource picker */}
            {type === "TAG" && (
              availableTags.length === 0 ? (
                <p className="flex-1 text-xs text-gray-400 flex items-center">
                  {!perm.canReadTags
                    ? <>No permission to view tags — ask admin for <code className="font-mono bg-gray-100 px-1 rounded">tags:read</code>.</>
                    : allTags.length === 0
                      ? (perm.canManageTags
                          ? <><a href={`/${slug}/contacts`} className="underline text-blue-600">Create tags</a>&nbsp;first.</>
                          : <>No tags exist yet — ask admin to create one.</>)
                      : "All tags already added."}
                </p>
              ) : (
                <select
                  className="flex-1 border rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={resourceId}
                  onChange={(e) => setResourceId(e.target.value)}
                >
                  <option value="">— Select tag —</option>
                  {availableTags.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              )
            )}

            {type === "COURSE" && (
              <p className="flex-1 text-xs text-gray-400 flex items-center">Courses coming soon.</p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setShowAdd(false); setResourceId(""); }}
              className="px-3 py-1.5 text-xs border rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd} disabled={!canAdd || saving}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Add
            </button>
          </div>
        </div>
      )}

      {resources.length === 0 && !showAdd && (
        <p className="text-xs text-gray-400">No resources added yet.</p>
      )}
    </div>
  );
}

// ─── PricePlansSection ────────────────────────────────────────────────────────

function PricePlansSection({ plans, currency, onAdd, onEdit, onDelete, saving, maxPlans, canManage }: {
  plans: (StepPricePlan | OrderBumpPricePlan)[];
  currency: string;
  onAdd: (f: PlanForm) => Promise<void>;
  onEdit: (id: string, f: PlanForm) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  saving: boolean;
  maxPlans?: number;
  // When false, the "Add plan" button + per-row Edit/Delete buttons are hidden.
  // Reads still render so the user sees what's configured. Mirrors the API
  // gate (funnels:price_plans:write for step plans, funnels:bumps:write for
  // bump-inline plans).
  canManage: boolean;
}) {
  const confirm = useConfirm();
  const [showAdd, setShowAdd]       = useState(false);
  const [editId, setEditId]         = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function planToForm(p: StepPricePlan | OrderBumpPricePlan): PlanForm {
    return {
      name: p.name, type: p.type,
      amount: (p.amount / 100).toString(),
      interval: p.interval ?? "month",
      trialDays: p.trialDays?.toString() ?? "",
      description: p.description ?? "",
    };
  }

  async function handleAdd(form: PlanForm) {
    await onAdd(form);
    setShowAdd(false);
  }

  async function handleEdit(form: PlanForm) {
    if (!editId) return;
    await onEdit(editId, form);
    setEditId(null);
  }

  async function handleDelete(id: string) {
    const ok = await confirm({ title: "Delete price plan?", variant: "danger", confirmLabel: "Delete" });
    if (!ok) return;
    setDeletingId(id);
    await onDelete(id);
    setDeletingId(null);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Price Plans</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {canManage
              ? "Pricing options offered at checkout."
              : <>You can&apos;t edit pricing. Ask admin for the matching write perm (<code className="font-mono bg-gray-100 px-1 rounded">funnels:price_plans:write</code> or <code className="font-mono bg-gray-100 px-1 rounded">funnels:bumps:write</code> for bumps).</>}
          </p>
        </div>
        {!showAdd && !editId && canManage && (maxPlans === undefined || plans.length < maxPlans) && (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700"
          >
            <Plus size={13} /> Add plan
          </button>
        )}
      </div>

      {showAdd && (
        <div className="mb-3">
          <PlanFormRow
            initial={EMPTY_PLAN} currency={currency}
            onSave={handleAdd} onCancel={() => setShowAdd(false)} saving={saving}
          />
        </div>
      )}

      {plans.length === 0 && !showAdd ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 flex flex-col items-center justify-center py-8 text-center">
          <Package size={24} className="text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">No price plans yet</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {canManage
              ? "Add a plan to enable checkout."
              : "Ask admin to add one — pricing is revenue-sensitive."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {plans.map((plan) => (
            <div key={plan.id}>
              {editId === plan.id ? (
                <PlanFormRow
                  initial={planToForm(plan)} currency={currency}
                  onSave={handleEdit} onCancel={() => setEditId(null)} saving={saving}
                />
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{plan.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${TYPE_BADGE[plan.type]}`}>
                        {TYPE_LABEL[plan.type]}
                      </span>
                      {plan.interval && <span className="text-xs text-gray-400">/ {plan.interval}</span>}
                      {plan.trialDays && <span className="text-xs text-gray-400">{plan.trialDays}d trial</span>}
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-gray-900 shrink-0">
                    {formatPrice(plan.amount, plan.currency)}
                  </span>
                  {canManage && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setEditId(plan.id); setShowAdd(false); }}
                        className="p-1.5 text-gray-300 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(plan.id)}
                        disabled={deletingId === plan.id}
                        className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                      >
                        {deletingId === plan.id
                          ? <Loader2 size={13} className="animate-spin" />
                          : <Trash2 size={13} />}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── CouponsSection ───────────────────────────────────────────────────────────

function CouponsSection({ stepId, allCoupons, stepCouponIds, currency, onCouponsChange, perm }: {
  stepId: string; allCoupons: Coupon[]; stepCouponIds: string[];
  currency: string;
  onCouponsChange: (ids: string[]) => void;
  perm: CrossDomainPerm;
}) {
  const slug = (useParams().workspaceSlug) as string;
  const [saving, setSaving]       = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const assigned   = allCoupons.filter((c) => stepCouponIds.includes(c.id));
  const unassigned = allCoupons.filter((c) => !stepCouponIds.includes(c.id));

  async function remove(couponId: string) {
    const next = stepCouponIds.filter((id) => id !== couponId);
    setSaving(true);
    await apiFetch(`/api/funnel-steps/${stepId}/coupons`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ couponIds: next }),
    });
    setSaving(false);
    onCouponsChange(next);
  }

  async function add(couponId: string) {
    const next = [...stepCouponIds, couponId];
    setSaving(true);
    await apiFetch(`/api/funnel-steps/${stepId}/coupons`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ couponIds: next }),
    });
    setSaving(false);
    onCouponsChange(next);
    if (unassigned.length <= 1) setShowPicker(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Ticket size={15} className="text-blue-600" />
          <h3 className="text-sm font-semibold text-gray-900">Coupons</h3>
          {assigned.length > 0 && (
            <span className="bg-blue-100 text-blue-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
              {assigned.length} enabled
            </span>
          )}
          {saving && <Loader2 size={12} className="animate-spin text-gray-400" />}
        </div>
        {/* "Manage" link goes to /coupons — hide if user can't read the list
            (the page itself would 403). Show as plain disabled text instead
            so the section still feels complete. */}
        {perm.canReadCoupons ? (
          <a href={`/${slug}/coupons`} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700">
            Manage <ExternalLink size={11} />
          </a>
        ) : null}
      </div>
      <p className="text-xs text-gray-400 mb-3">
        {perm.canReadCoupons
          ? "Customers can apply these codes at checkout on this step."
          : <>You can&apos;t see the coupon catalog. Ask admin for <code className="font-mono bg-gray-100 px-1 rounded">coupons:read</code>.</>}
      </p>
      <div className="space-y-2">
        {assigned.map((coupon) => (
          <div key={coupon.id} className="bg-white rounded-xl border border-blue-200 px-3 py-2.5 flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
              <Ticket size={13} className="text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold text-gray-900 tracking-wider">{coupon.code}</span>
                <span className="text-xs font-medium text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-full border border-blue-200">
                  {formatDiscount(coupon, currency)}
                </span>
                {!coupon.active && (
                  <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">Inactive</span>
                )}
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {coupon.usedCount} uses{coupon.maxUses ? ` / ${coupon.maxUses} max` : ""}
                {coupon.expiresAt ? ` · Expires ${new Date(coupon.expiresAt).toLocaleDateString()}` : ""}
              </p>
            </div>
            <button
              onClick={() => remove(coupon.id)} disabled={saving}
              className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40 shrink-0"
            >
              <X size={13} />
            </button>
          </div>
        ))}

        {unassigned.length > 0 && !showPicker && perm.canReadCoupons && (
          <button
            onClick={() => setShowPicker(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-blue-600 border border-dashed border-blue-300 rounded-xl hover:bg-blue-50 w-full"
          >
            <Plus size={13} /> Add coupon
          </button>
        )}

        {showPicker && (
          <div className="border border-blue-200 rounded-xl bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
              <span className="text-xs font-medium text-gray-600">Select a coupon</span>
              <button onClick={() => setShowPicker(false)} className="text-gray-400 hover:text-gray-700">
                <X size={13} />
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {unassigned.map((coupon) => (
                <button
                  key={coupon.id} onClick={() => add(coupon.id)} disabled={saving}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 text-left border-b border-gray-50 last:border-0"
                >
                  <span className="font-mono text-sm font-semibold text-gray-900 tracking-wider">{coupon.code}</span>
                  <span className="text-xs text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-full border border-blue-200">
                    {formatDiscount(coupon, currency)}
                  </span>
                  {!coupon.active && (
                    <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">Inactive</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {assigned.length === 0 && !showPicker && allCoupons.length === 0 && (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 flex flex-col items-center justify-center py-5 text-center">
            <Ticket size={18} className="text-gray-300 mb-1.5" />
            <p className="text-xs text-gray-500">
              {perm.canReadCoupons ? "No coupons yet" : "Coupon catalog hidden"}
            </p>
            {perm.canReadCoupons && perm.canManageCoupons ? (
              <a href={`/${slug}/coupons`} className="text-xs text-blue-600 hover:underline mt-0.5">Create coupons →</a>
            ) : perm.canReadCoupons ? (
              <p className="text-xs text-gray-400 mt-0.5">Ask admin to create one.</p>
            ) : (
              <p className="text-xs text-gray-400 mt-0.5">Need <code className="font-mono bg-gray-100 px-1 rounded">coupons:read</code>.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── OrderBumpCard ────────────────────────────────────────────────────────────

function OrderBumpCard({ stepId, bump, currency, allTags, physicalProducts, stepPhysicalProductId, onUpdate, onDelete, perm }: {
  stepId: string; bump: OrderBump; currency: string; allTags: WorkspaceTag[];
  physicalProducts: PhysicalProduct[]; stepPhysicalProductId: string | null;
  onUpdate: (updated: OrderBump) => void;
  onDelete: () => void;
  perm: CrossDomainPerm;
}) {
  const slug = (useParams().workspaceSlug) as string;
  const confirm = useConfirm();
  const [expanded, setExpanded]       = useState(false);
  const [savingOffer, setSavingOffer]  = useState(false);
  const [savingRes, setSavingRes]     = useState(false);
  const [savingPlan, setSavingPlan]   = useState(false);
  const [editName, setEditName]       = useState(false);
  const [labelVal, setLabelVal]       = useState(bump.label);
  const [headlineVal, setHeadlineVal] = useState(bump.headline ?? "");

  async function patchBump(body: object): Promise<OrderBump> {
    const res = await apiFetch(`/api/funnel-steps/${stepId}/order-bumps/${bump.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  async function saveName() {
    if (!labelVal.trim()) return;
    setSavingOffer(true);
    const updated = await patchBump({ label: labelVal.trim(), headline: headlineVal });
    onUpdate(updated);
    setSavingOffer(false);
    setEditName(false);
  }

  async function saveOfferType(type: "DIGITAL" | "PHYSICAL", productId?: string | null) {
    setSavingOffer(true);
    const updated = await patchBump({
      offerType: type,
      physicalProductId: type === "PHYSICAL" ? (productId ?? bump.physicalProductId) : null,
      shippingFee: type === "PHYSICAL" ? bump.shippingFee / 100 : 0,
    });
    onUpdate(updated);
    setSavingOffer(false);
  }

  async function saveShippingFee(value: string) {
    setSavingOffer(true);
    const updated = await patchBump({ shippingFee: value });
    onUpdate(updated);
    setSavingOffer(false);
  }

  async function toggleResource(type: string, resourceId: string) {
    setSavingRes(true);
    const res = await apiFetch(`/api/funnel-steps/${stepId}/order-bumps/${bump.id}/resources`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, resourceId }),
    });
    const resources: StepResource[] = await res.json();
    onUpdate({ ...bump, resources });
    setSavingRes(false);
  }

  async function addPlan(form: PlanForm) {
    setSavingPlan(true);
    const res = await apiFetch(`/api/funnel-steps/${stepId}/order-bumps/${bump.id}/price-plans`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name, type: form.type,
        amount: parseFloat(form.amount) || 0,
        interval: form.type === "SUBSCRIPTION" ? form.interval : null,
        trialDays: form.type === "SUBSCRIPTION" && form.trialDays ? parseInt(form.trialDays) : null,
        description: form.description || null,
      }),
    });
    const plan: OrderBumpPricePlan = await res.json();
    onUpdate({ ...bump, pricePlans: [...bump.pricePlans, plan] });
    setSavingPlan(false);
  }

  async function editPlan(id: string, form: PlanForm) {
    setSavingPlan(true);
    const res = await apiFetch(`/api/funnel-steps/${stepId}/order-bumps/${bump.id}/price-plans/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name, type: form.type,
        amount: parseFloat(form.amount) || 0,
        interval: form.type === "SUBSCRIPTION" ? form.interval : null,
        trialDays: form.type === "SUBSCRIPTION" && form.trialDays ? parseInt(form.trialDays) : null,
        description: form.description || null,
      }),
    });
    const updated: OrderBumpPricePlan = await res.json();
    onUpdate({ ...bump, pricePlans: bump.pricePlans.map((p) => (p.id === id ? updated : p)) });
    setSavingPlan(false);
  }

  async function deletePlan(id: string) {
    await apiFetch(`/api/funnel-steps/${stepId}/order-bumps/${bump.id}/price-plans/${id}`, { method: "DELETE" });
    onUpdate({ ...bump, pricePlans: bump.pricePlans.filter((p) => p.id !== id) });
  }

  async function handleDelete() {
    const ok = await confirm({ title: `Delete "${bump.label}"?`, description: "This will remove the order bump and all its price plans.", variant: "danger", confirmLabel: "Delete" });
    if (!ok) return;
    await apiFetch(`/api/funnel-steps/${stepId}/order-bumps/${bump.id}`, { method: "DELETE" });
    onDelete();
  }

  const tagCount  = bump.resources.filter((r) => r.type === "TAG").length;
  const planCount = bump.pricePlans.length;

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
          <ShoppingBag size={15} className="text-orange-500" />
        </div>
        <div className="flex-1 min-w-0">
          {editName ? (
            <div className="space-y-1">
              <input
                className="w-full border rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={labelVal}
                onChange={(e) => setLabelVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditName(false); }}
                autoFocus
              />
              <input
                className="w-full border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Headline (optional)"
                value={headlineVal}
                onChange={(e) => setHeadlineVal(e.target.value)}
              />
              <div className="flex gap-1.5">
                <button
                  onClick={saveName} disabled={savingOffer}
                  className="flex items-center gap-1 px-2 py-1 bg-blue-600 text-white text-xs rounded-lg disabled:opacity-50"
                >
                  {savingOffer ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Save
                </button>
                <button onClick={() => setEditName(false)} className="px-2 py-1 text-xs border rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium text-gray-900 truncate">{bump.label}</p>
              {bump.headline && <p className="text-xs text-gray-400 truncate">{bump.headline}</p>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!editName && perm.canManageBumps && (
            <button
              onClick={() => setEditName(true)}
              className="p-1.5 text-gray-300 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              <Pencil size={13} />
            </button>
          )}
          {perm.canManageBumps && (
            <button
              onClick={handleDelete}
              className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg"
            >
              <Trash2 size={13} />
            </button>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Summary pills */}
      {!expanded && (
        <div className="flex gap-2 px-4 pb-3">
          {bump.offerType && (
            <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
              {bump.offerType === "DIGITAL" ? <Monitor size={10} /> : <Package size={10} />}
              {bump.offerType === "DIGITAL" ? "Digital" : "Physical"}
            </span>
          )}
          {planCount > 0 && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
              {planCount} plan{planCount > 1 ? "s" : ""}
            </span>
          )}
          {tagCount > 0 && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-600">
              {tagCount} tag{tagCount > 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-5">
          {/* Offer type */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Offer Type</h4>
            <OfferTypeSelector
              value={bump.offerType}
              onChange={saveOfferType}
              disabled={savingOffer}
            />
          </div>

          {/* Physical config */}
          {bump.offerType === "PHYSICAL" && (
            <div className="space-y-3">
              {(() => {
                if (!perm.canReadProducts) {
                  return (
                    <p className="text-sm text-amber-600">
                      No permission to view products. Ask admin for <code className="font-mono text-xs bg-amber-50 px-1 py-0.5 rounded">products:read</code>.
                    </p>
                  );
                }
                const eligible = physicalProducts.filter(
                  (p) => p.id !== stepPhysicalProductId && p.currency.toLowerCase() === currency.toLowerCase(),
                );
                if (eligible.length === 0) {
                  return (
                    <p className="text-sm text-amber-600">
                      No {currency.toUpperCase()} products available.{" "}
                      {perm.canManageProducts ? (
                        <><a href={`/${slug}/physical-products`} className="underline font-medium">Create one</a> in the funnel currency.</>
                      ) : (
                        <>Ask admin to create one.</>
                      )}
                    </p>
                  );
                }
                return (
                  <select
                    className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={bump.physicalProductId ?? ""}
                    onChange={(e) => saveOfferType("PHYSICAL", e.target.value || null)}
                  >
                    <option value="">— Select a product —</option>
                    {eligible.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}{p.sku ? ` (${p.sku})` : ""} — {formatPrice(p.price, p.currency)}
                      </option>
                    ))}
                  </select>
                );
              })()}
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">Shipping fee</label>
                <div className="flex items-center gap-2">
                  <div className={`flex border rounded-xl overflow-hidden w-40 ${!perm.canManageBumps ? "opacity-60" : ""}`}>
                    <span className="px-3 py-2 text-sm bg-gray-50 text-gray-500 font-medium border-r select-none">$</span>
                    <input
                      type="number" min="0" step="0.01"
                      disabled={!perm.canManageBumps}
                      className="flex-1 px-3 py-2 text-sm focus:outline-none disabled:bg-gray-50 disabled:cursor-not-allowed"
                      placeholder="0.00"
                      defaultValue={(bump.shippingFee / 100).toString()}
                      onBlur={(e) => saveShippingFee(e.target.value)}
                    />
                  </div>
                  <span className="text-xs text-gray-400">
                    {perm.canManageBumps
                      ? "Enter 0 for free shipping"
                      : <>Read-only — needs <code className="font-mono bg-gray-100 px-1 rounded">funnels:bumps:write</code></>}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Resources — only for DIGITAL */}
          {bump.offerType === "DIGITAL" && (
            <ResourcesSection
              resources={bump.resources} allTags={allTags}
              onToggle={toggleResource} saving={savingRes}
              perm={perm}
            />
          )}

          {/* Price plans — only for DIGITAL, PHYSICAL takes price from product.
              Bump-inline price plans are gated by the BUMPS perm (not the
              step price-plans perm — that's for the main offer). */}
          {bump.offerType === "DIGITAL" && (
            <PricePlansSection
              plans={bump.pricePlans} currency={currency}
              onAdd={addPlan} onEdit={editPlan} onDelete={deletePlan}
              saving={savingPlan} maxPlans={1}
              canManage={perm.canManageBumps}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── OrderBumpsSection ────────────────────────────────────────────────────────

function OrderBumpsSection({ stepId, bumps, currency, allTags, physicalProducts, stepPhysicalProductId, onBumpsChange, perm }: {
  stepId: string; bumps: OrderBump[]; currency: string;
  allTags: WorkspaceTag[]; physicalProducts: PhysicalProduct[];
  stepPhysicalProductId: string | null;
  onBumpsChange: (bumps: OrderBump[]) => void;
  perm: CrossDomainPerm;
}) {
  const [adding, setAdding]   = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving]   = useState(false);

  async function addBump() {
    if (!newName.trim()) return;
    setSaving(true);
    const res = await apiFetch(`/api/funnel-steps/${stepId}/order-bumps`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: newName.trim() }),
    });
    const bump: OrderBump = await res.json();
    onBumpsChange([...bumps, bump]);
    setNewName("");
    setAdding(false);
    setSaving(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <ShoppingBag size={15} className="text-orange-500" />
          <h3 className="text-sm font-semibold text-gray-900">Order Bumps</h3>
          {bumps.length > 0 && (
            <span className="bg-orange-100 text-orange-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
              {bumps.length}
            </span>
          )}
        </div>
        {!adding && bumps.length === 0 && perm.canManageBumps && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white text-xs font-medium rounded-lg hover:bg-orange-600"
          >
            <Plus size={13} /> Add bump
          </button>
        )}
      </div>
      <p className="text-xs text-gray-400 mb-3">
        {perm.canManageBumps
          ? "Add-on offers shown at checkout. Customers can add them with a single click."
          : <>You can&apos;t manage order bumps. Ask admin for <code className="font-mono bg-gray-100 px-1 rounded">funnels:bumps:write</code>.</>}
      </p>

      {adding && (
        <div className="border border-orange-200 rounded-xl p-3 bg-orange-50/40 mb-3 flex gap-2">
          <input
            autoFocus
            className="flex-1 border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
            placeholder="Bump name e.g. Add Training Videos"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addBump(); if (e.key === "Escape") setAdding(false); }}
          />
          <button
            onClick={addBump} disabled={saving || !newName.trim()}
            className="flex items-center gap-1 px-3 py-1.5 bg-orange-500 text-white text-xs font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Add
          </button>
          <button onClick={() => setAdding(false)} className="px-3 py-1.5 text-xs border rounded-lg hover:bg-gray-50">
            <X size={12} />
          </button>
        </div>
      )}

      {bumps.length === 0 && !adding ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 flex flex-col items-center justify-center py-8 text-center">
          <ShoppingBag size={24} className="text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">No order bumps yet</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {perm.canManageBumps
              ? "Add a bump to increase average order value."
              : "Ask admin to add one — bumps are revenue-sensitive."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {bumps.map((bump) => (
            <OrderBumpCard
              key={bump.id}
              stepId={stepId}
              bump={bump}
              currency={currency}
              allTags={allTags}
              physicalProducts={physicalProducts}
              stepPhysicalProductId={stepPhysicalProductId}
              onUpdate={(updated) => onBumpsChange(bumps.map((b) => (b.id === bump.id ? updated : b)))}
              onDelete={() => onBumpsChange(bumps.filter((b) => b.id !== bump.id))}
              perm={perm}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

// Permission flags pulled from useRole + observed API status codes. Passed
// down to subcomponents so they can render honest empty states + gate
// write affordances:
//   - "no data" → show normal "Create one" CTA (if user can create)
//   - "no read perm" → show "Ask admin for X:read" instead of empty list
//   - "no write perm" → hide the "Create one" / "Add" CTA (it'd 403)
//
// Bundles two unrelated concerns for prop-drilling convenience:
//   (a) Cross-domain perms (tags / products / coupons)  → for picker UX
//   (b) Sub-funnel perms (bumps, step price plans)      → for Add/Edit gates
export type CrossDomainPerm = {
  // Cross-domain READ — derived from API response status (403 → false).
  // Optimistic default true; flipped to false in fetchData when status === 403.
  canReadProducts: boolean;
  canReadTags:     boolean;
  canReadCoupons:  boolean;
  // Cross-domain WRITE — from useRole(). Decides whether to show "Create"
  // links/buttons that lead to the products/tags/coupons pages.
  canManageProducts: boolean;
  canManageTags:     boolean;
  canManageCoupons:  boolean;
  // Sub-funnel WRITE — revenue-sensitive (see permissions.ts).
  // canManageBumps      → POST/PATCH/DELETE on order-bumps + their inline plans
  // canManagePricePlans → POST/PATCH/DELETE on step price plans (main offer)
  canManageBumps:      boolean;
  canManagePricePlans: boolean;
};

export default function ProductsTab({ stepId, stepType }: { stepId: string; stepType?: string }) {
  const params = useParams();
  const slug = params.workspaceSlug as string;
  // Coupons + Order Bumps are checkout-form concepts. Upsell/Downsell are
  // one-click fixed-price charges (no cart, no coupon entry) → hide them there.
  const isCheckout = stepType === "CHECKOUT";
  const {
    canManageFunnels,
    canManagePricePlans,
    canManageBumps,
    canReadProducts:   roleReadProducts,
    canManageProducts,
    canReadTags:       roleReadTags,
    canManageTags,
    canReadCoupons:    roleReadCoupons,
    canManageCoupons,
  } = useRole();
  const [offerType, setOfferType]               = useState<"DIGITAL" | "PHYSICAL" | null>(null);
  const [funnelCurrency, setFunnelCurrency]     = useState<string>("usd");
  const [physicalProductId, setPhysicalProductId] = useState<string | null>(null);
  const [shippingFee, setShippingFee]           = useState<string>("0");
  const [resources, setResources]               = useState<StepResource[]>([]);
  const [plans, setPlans]                       = useState<StepPricePlan[]>([]);
  const [orderBumps, setOrderBumps]             = useState<OrderBump[]>([]);
  const [physicalProducts, setPhysicalProducts] = useState<PhysicalProduct[]>([]);
  const [allTags, setAllTags]                   = useState<WorkspaceTag[]>([]);
  const [allCoupons, setAllCoupons]             = useState<Coupon[]>([]);
  const [stepCouponIds, setStepCouponIds]       = useState<string[]>([]);
  const [loading, setLoading]                   = useState(true);

  // Start optimistic — flipped to false below if any of the cross-domain
  // GETs come back 403. Useful for users with funnels:write but missing
  // products:read / tags:read / coupons:read.
  const [readPerm, setReadPerm] = useState({
    products: roleReadProducts,
    tags:     roleReadTags,
    coupons:  roleReadCoupons,
  });

  const [savingOfferType, setSavingOfferType]   = useState(false);
  const [savingResources, setSavingResources]   = useState(false);
  const [savingPlan, setSavingPlan]             = useState(false);

  const fetchData = useCallback(async () => {
    // Keep the parallel fetch but defer .json() so we can read .status first.
    // 403 from a cross-domain read isn't an error — it tells us the user
    // can edit funnels but can't see products/tags/coupons. Surface that
    // in `readPerm` so empty states can be honest.
    const [stepRes, plansRes, productsRes, tagsRes, couponsRes, resourcesRes, bumpsRes] = await Promise.all([
      apiFetch(`/api/funnel-steps/${stepId}`),
      apiFetch(`/api/funnel-steps/${stepId}/price-plans`),
      apiFetch("/api/physical-products"),
      apiFetch("/api/tags"),
      apiFetch("/api/coupons"),
      apiFetch(`/api/funnel-steps/${stepId}/resources`),
      apiFetch(`/api/funnel-steps/${stepId}/order-bumps`),
    ]);

    setReadPerm({
      products: productsRes.status !== 403,
      tags:     tagsRes.status !== 403,
      coupons:  couponsRes.status !== 403,
    });

    const stepJson  = await stepRes.json();
    const plansJson = await plansRes.json();
    // For the cross-domain reads: if 403, keep state as empty array; the
    // empty-state render path now handles the no-perm message itself.
    const productsJson = productsRes.status === 403 ? [] : await productsRes.json();
    const tagsJson     = tagsRes.status     === 403 ? [] : await tagsRes.json();
    const couponsJson  = couponsRes.status  === 403 ? [] : await couponsRes.json();
    const resourcesJson = await resourcesRes.json();
    const bumpsJson     = await bumpsRes.json();

    const step = stepJson.data ?? stepJson;
    setOfferType(step.offerType ?? null);
    setFunnelCurrency(step.funnel?.currency ?? "usd");
    setPhysicalProductId(step.physicalProductId ?? null);
    setStepCouponIds(step.couponIds ?? []);
    setShippingFee(((step.shippingFee ?? 0) / 100).toString());
    setPlans(Array.isArray(plansJson) ? plansJson : []);
    setPhysicalProducts(Array.isArray(productsJson) ? productsJson : []);
    setAllTags(Array.isArray(tagsJson) ? tagsJson : (tagsJson.data ?? []));
    setAllCoupons(Array.isArray(couponsJson) ? couponsJson : []);
    setResources(Array.isArray(resourcesJson) ? resourcesJson : []);
    setOrderBumps(Array.isArray(bumpsJson) ? bumpsJson : []);
    setLoading(false);
  }, [stepId]);

  const perm: CrossDomainPerm = {
    canReadProducts:   readPerm.products,
    canReadTags:       readPerm.tags,
    canReadCoupons:    readPerm.coupons,
    canManageProducts,
    canManageTags,
    canManageCoupons,
    canManageBumps,
    canManagePricePlans,
  };

  useEffect(() => { fetchData(); }, [fetchData]);

  async function saveOfferType(type: "DIGITAL" | "PHYSICAL", productId?: string | null, fee?: string) {
    if (!canManageFunnels) return;
    setSavingOfferType(true);
    await apiFetch(`/api/funnel-steps/${stepId}/offer-type`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        offerType: type,
        physicalProductId: productId ?? null,
        shippingFee: type === "PHYSICAL" ? Math.round((parseFloat(fee ?? shippingFee) || 0) * 100) : 0,
      }),
    });
    setOfferType(type);
    if (type === "PHYSICAL") setPhysicalProductId(productId ?? null);
    setSavingOfferType(false);
  }

  async function saveShippingFee(value: string) {
    // Shipping is bundled under price_plans perm (revenue-sensitive). Without
    // it the API would 403 anyway — gate up-front for clean UX.
    if (!canManagePricePlans) return;
    setShippingFee(value);
    await apiFetch(`/api/funnel-steps/${stepId}/offer-type`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        offerType: "PHYSICAL",
        physicalProductId: physicalProductId ?? null,
        shippingFee: Math.round((parseFloat(value) || 0) * 100),
      }),
    });
  }

  async function toggleResource(type: string, resourceId: string) {
    if (!canManageFunnels) return;
    setSavingResources(true);
    const res = await apiFetch(`/api/funnel-steps/${stepId}/resources`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, resourceId }),
    });
    const updated: StepResource[] = await res.json();
    setResources(updated);
    setSavingResources(false);
  }

  async function handleAddPlan(form: PlanForm) {
    if (!canManagePricePlans) return;
    setSavingPlan(true);
    const res = await apiFetch(`/api/funnel-steps/${stepId}/price-plans`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name, type: form.type,
        amount: parseFloat(form.amount) || 0,
        interval: form.type === "SUBSCRIPTION" ? form.interval : null,
        trialDays: form.type === "SUBSCRIPTION" && form.trialDays ? parseInt(form.trialDays) : null,
        description: form.description || null,
      }),
    });
    const created = await res.json();
    setPlans((prev) => [...prev, created]);
    setSavingPlan(false);
  }

  async function handleEditPlan(id: string, form: PlanForm) {
    if (!canManagePricePlans) return;
    setSavingPlan(true);
    const res = await apiFetch(`/api/funnel-steps/${stepId}/price-plans/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name, type: form.type,
        amount: parseFloat(form.amount) || 0,
        interval: form.type === "SUBSCRIPTION" ? form.interval : null,
        trialDays: form.type === "SUBSCRIPTION" && form.trialDays ? parseInt(form.trialDays) : null,
        description: form.description || null,
      }),
    });
    const updated = await res.json();
    setPlans((prev) => prev.map((p) => (p.id === id ? updated : p)));
    setSavingPlan(false);
  }

  async function handleDeletePlan(id: string) {
    if (!canManagePricePlans) return;
    await apiFetch(`/api/funnel-steps/${stepId}/price-plans/${id}`, { method: "DELETE" });
    setPlans((prev) => prev.filter((p) => p.id !== id));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={20} className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-6">

      {/* Offer Type */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Offer Type</h3>
        <OfferTypeSelector
          value={offerType}
          onChange={(type) => saveOfferType(type, type === "PHYSICAL" ? physicalProductId : null)}
          disabled={savingOfferType || !canManageFunnels}
        />
      </div>

      {/* PHYSICAL */}
      {offerType === "PHYSICAL" && (() => {
        const eligible = physicalProducts.filter(
          (p) => p.currency.toLowerCase() === funnelCurrency.toLowerCase(),
        );
        return (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Physical Product</h3>
          {!perm.canReadProducts ? (
            <p className="text-sm text-amber-600">
              You don&apos;t have permission to view products. Ask your admin for <code className="font-mono text-xs bg-amber-50 px-1 py-0.5 rounded">products:read</code>.
            </p>
          ) : eligible.length === 0 ? (
            <p className="text-sm text-amber-600">
              No {funnelCurrency.toUpperCase()} products available.{" "}
              {perm.canManageProducts ? (
                <><a href={`/${slug}/physical-products`} className="underline font-medium">Create one</a> in the funnel currency.</>
              ) : (
                <>Ask your admin to create one in the funnel currency.</>
              )}
            </p>
          ) : (
            <select
              className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={physicalProductId ?? ""}
              onChange={(e) => {
                const val = e.target.value || null;
                setPhysicalProductId(val);
                saveOfferType("PHYSICAL", val);
              }}
            >
              <option value="">— Select a product —</option>
              {eligible.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.sku ? ` (${p.sku})` : ""} — {formatPrice(p.price, p.currency)}
                </option>
              ))}
            </select>
          )}
          <p className="text-xs text-gray-400 mt-2">Price is taken directly from the selected product.</p>
          <div className="mt-4">
            <label className="text-sm font-medium text-gray-700 mb-1 block">Shipping fee</label>
            <div className="flex items-center gap-2">
              <div className={`flex border rounded-xl overflow-hidden w-40 ${!canManagePricePlans ? "opacity-60" : ""}`}>
                <span className="px-3 py-2.5 text-sm bg-gray-50 text-gray-500 font-medium border-r select-none">$</span>
                <input
                  type="number" min="0" step="0.01"
                  disabled={!canManagePricePlans}
                  className="flex-1 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:cursor-not-allowed"
                  placeholder="0.00" value={shippingFee}
                  onChange={(e) => setShippingFee(e.target.value)}
                  onBlur={(e) => saveShippingFee(e.target.value)}
                />
              </div>
              <span className="text-xs text-gray-400">
                {canManagePricePlans
                  ? "Enter 0 for free shipping"
                  : <>Read-only — needs <code className="font-mono bg-gray-100 px-1 rounded">funnels:price_plans:write</code></>}
              </span>
            </div>
          </div>
        </div>
        );
      })()}

      {/* DIGITAL */}
      {offerType === "DIGITAL" && (
        <>
          <ResourcesSection
            resources={resources} allTags={allTags}
            onToggle={toggleResource} saving={savingResources}
            perm={perm}
          />

          <PricePlansSection
            plans={plans} currency={funnelCurrency}
            onAdd={handleAddPlan} onEdit={handleEditPlan} onDelete={handleDeletePlan}
            saving={savingPlan}
            // One-click upsell/downsell = a single fixed offer; checkout can have
            // multiple pricing tiers.
            maxPlans={isCheckout ? undefined : 1}
            canManage={canManagePricePlans}
          />
        </>
      )}

      {/* Coupons — checkout only (no coupon entry on one-click upsell/downsell) */}
      {offerType && isCheckout && (
        <div className="border-t pt-5">
          <CouponsSection
            stepId={stepId}
            allCoupons={allCoupons}
            stepCouponIds={stepCouponIds}
            currency={funnelCurrency}
            onCouponsChange={(ids) => setStepCouponIds(ids)}
            perm={perm}
          />
        </div>
      )}

      {/* Order Bumps — checkout only (no cart add-ons on one-click upsell/downsell) */}
      {offerType && isCheckout && (
        <div className="border-t pt-5">
          <OrderBumpsSection
            stepId={stepId}
            bumps={orderBumps}
            currency={funnelCurrency}
            allTags={allTags}
            physicalProducts={physicalProducts}
            stepPhysicalProductId={physicalProductId}
            onBumpsChange={setOrderBumps}
            perm={perm}
          />
        </div>
      )}

      {!offerType && (
        <div className="text-center py-8 text-gray-400 text-sm">
          Select an offer type above to configure.
        </div>
      )}
    </div>
  );
}
