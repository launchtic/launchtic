"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search, ChevronLeft, ChevronRight, Ticket, Plus, Pencil, Trash2, Loader2,
  ToggleLeft, ToggleRight,
} from "lucide-react";
import FormDrawer from "../../../../components/ui/FormDrawer";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { useRole } from "../../../../lib/role";
import { apiFetch } from "../../../../lib/api-client";

type Coupon = {
  id: string; code: string; type: "percentage" | "fixed";
  discount: number; maxUses: number | null; usedCount: number;
  expiresAt: string | null; active: boolean; createdAt: string;
};

type CouponFormState = {
  code: string; type: "percentage" | "fixed";
  discount: string; maxUses: string; expiresAt: string;
};

type PageMeta = { total: number; page: number; pageSize: number; totalPages: number };

const EMPTY_FORM: CouponFormState = { code: "", type: "percentage", discount: "", maxUses: "", expiresAt: "" };

function formatDiscount(c: Coupon) {
  if (c.type === "percentage") return `${c.discount}% off`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "usd", minimumFractionDigits: 0 }).format(c.discount / 100) + " off";
}

export default function CouponsPage() {
  const [items, setItems] = useState<Coupon[]>([]);
  const [meta, setMeta] = useState<PageMeta>({ total: 0, page: 1, pageSize: 25, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CouponFormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirm = useConfirm();
  const { canManageCoupons } = useRole();

  const fetchData = useCallback(async (q: string, p: number) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), pageSize: "25" });
    if (q) params.set("search", q);
    const res = await apiFetch(`/api/coupons?${params}`);
    const json = await res.json();
    if (json.success) {
      setItems(json.data.items);
      setMeta({ total: json.data.total, page: json.data.page, pageSize: json.data.pageSize, totalPages: json.data.totalPages });
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(search, page); }, [fetchData, page]);

  function handleSearch(val: string) {
    setSearch(val);
    setPage(1);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchData(val, 1), 350);
  }

  function openCreate() {
    setDrawerMode("create");
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError("");
  }

  function openEdit(c: Coupon) {
    setDrawerMode("edit");
    setEditingId(c.id);
    setForm({
      code: c.code,
      type: c.type,
      discount: c.type === "fixed" ? (c.discount / 100).toString() : c.discount.toString(),
      maxUses: c.maxUses?.toString() ?? "",
      expiresAt: c.expiresAt ? c.expiresAt.split("T")[0] : "",
    });
    setFormError("");
  }

  function closeDrawer() {
    if (submitting) return;
    setDrawerMode(null);
    setEditingId(null);
  }

  function setField<K extends keyof CouponFormState>(k: K, v: CouponFormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit() {
    if (!form.code.trim()) { setFormError("Code is required"); return; }
    if (!form.discount) { setFormError("Discount is required"); return; }

    setSubmitting(true);
    setFormError("");
    const payload = {
      code: form.code,
      type: form.type,
      discount: parseFloat(form.discount) || 0,
      maxUses: form.maxUses || null,
      expiresAt: form.expiresAt || null,
    };
    const url = drawerMode === "edit" && editingId ? `/api/coupons/${editingId}` : "/api/coupons";
    const method = drawerMode === "edit" ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) { setFormError(data.error || "Failed"); return; }
    setDrawerMode(null);
    setEditingId(null);
    fetchData(search, page);
  }

  async function handleDelete(coupon: Coupon) {
    const ok = await confirm({
      title: `Delete coupon "${coupon.code}"?`,
      description: "Existing orders keep their discount. This action cannot be undone.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    setDeletingId(coupon.id);
    await apiFetch(`/api/coupons/${coupon.id}`, { method: "DELETE" });
    setDeletingId(null);
    fetchData(search, page);
  }

  async function toggleActive(coupon: Coupon) {
    const res = await apiFetch(`/api/coupons/${coupon.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !coupon.active }),
    });
    const data = await res.json();
    if (res.ok) setItems((prev) => prev.map((c) => (c.id === coupon.id ? data : c)));
  }

  const isExpired = (c: Coupon) => !!c.expiresAt && new Date(c.expiresAt) < new Date();
  const isExhausted = (c: Coupon) => !!c.maxUses && c.usedCount >= c.maxUses;

  const formValid = !!form.code.trim() && !!form.discount;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 px-4 sm:px-6 py-4 shrink-0">
        <div className="shrink-0">
          <h1 className="text-xl font-bold text-gray-900">Coupons</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {meta.total.toLocaleString()} {meta.total === 1 ? "coupon" : "coupons"}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 lg:flex-1 lg:justify-end">
          <div className="relative sm:flex-1 lg:max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search by code…"
              className="w-full pl-9 pr-3 py-2 text-base sm:text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
          {canManageCoupons && (
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors shrink-0"
            >
              <Plus size={15} /> New coupon
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 sm:px-6 pb-4">
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={20} className="animate-spin text-gray-400" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mb-3">
              <Ticket size={20} className="text-blue-500" />
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">No coupons found</p>
            <p className="text-xs text-gray-400">
              {search ? "Try adjusting your search" : "Create discount codes and assign them to funnel steps"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <th className="text-left px-6 py-3 font-semibold">Code</th>
                <th className="text-left px-4 py-3 font-semibold">Discount</th>
                <th className="text-left px-4 py-3 font-semibold">Usage</th>
                <th className="text-left px-4 py-3 font-semibold">Expires</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
                <th className="text-right px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((coupon) => {
                const dimmed = !coupon.active || isExpired(coupon) || isExhausted(coupon);
                return (
                  <tr key={coupon.id} className={`hover:bg-gray-50 transition-colors ${dimmed ? "opacity-60" : ""}`}>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                          <Ticket size={14} className="text-blue-600" />
                        </div>
                        <span className="font-mono text-sm font-bold text-gray-900 tracking-wider">{coupon.code}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                        {formatDiscount(coupon)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {coupon.usedCount}{coupon.maxUses ? ` / ${coupon.maxUses}` : ""}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {coupon.expiresAt ? new Date(coupon.expiresAt).toLocaleDateString() : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {!coupon.active ? (
                        <span className="text-[10px] font-medium bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Inactive</span>
                      ) : isExpired(coupon) ? (
                        <span className="text-[10px] font-medium bg-red-50 text-red-500 px-2 py-0.5 rounded-full">Expired</span>
                      ) : isExhausted(coupon) ? (
                        <span className="text-[10px] font-medium bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full">Limit reached</span>
                      ) : (
                        <span className="text-[10px] font-medium bg-green-50 text-green-600 px-2 py-0.5 rounded-full">Active</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {canManageCoupons && (
                          <button
                            onClick={() => toggleActive(coupon)}
                            title={coupon.active ? "Deactivate" : "Activate"}
                            className="p-1 text-gray-400 hover:text-gray-700 transition-colors"
                          >
                            {coupon.active
                              ? <ToggleRight size={20} className="text-blue-600" />
                              : <ToggleLeft size={20} />}
                          </button>
                        )}
                        {canManageCoupons && (
                          <button
                            onClick={() => openEdit(coupon)}
                            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Edit coupon"
                          >
                            <Pencil size={14} />
                          </button>
                        )}
                        {canManageCoupons && (
                          <button
                            onClick={() => handleDelete(coupon)}
                            disabled={deletingId === coupon.id}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                            title="Delete coupon"
                          >
                            {deletingId === coupon.id
                              ? <Loader2 size={14} className="animate-spin" />
                              : <Trash2 size={14} />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}

        {meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              {(meta.page - 1) * meta.pageSize + 1}–{Math.min(meta.page * meta.pageSize, meta.total)} of {meta.total}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={meta.page === 1}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="px-2 text-xs text-gray-600">{meta.page} / {meta.totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                disabled={meta.page === meta.totalPages}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-30 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
        </div>
      </div>

      {/* Create/Edit drawer */}
      <FormDrawer
        open={drawerMode !== null}
        onClose={closeDrawer}
        title={drawerMode === "edit" ? "Edit coupon" : "New coupon"}
        width="md"
        submitLabel={drawerMode === "edit" ? "Save changes" : "Create coupon"}
        submitting={submitting}
        submitDisabled={!formValid}
        onSubmit={handleSubmit}
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Code <span className="text-red-500">*</span></label>
              <input
                autoFocus
                value={form.code}
                onChange={(e) => setField("code", e.target.value.toUpperCase())}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono uppercase tracking-wider"
                placeholder="SAVE20"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Type</label>
              <select
                value={form.type}
                onChange={(e) => setField("type", e.target.value as "percentage" | "fixed")}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed amount ($)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {form.type === "percentage" ? "Discount %" : "Discount ($)"} <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                step={form.type === "percentage" ? "1" : "0.01"}
                max={form.type === "percentage" ? "100" : undefined}
                value={form.discount}
                onChange={(e) => setField("discount", e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={form.type === "percentage" ? "20" : "10.00"}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Max uses</label>
              <input
                type="number"
                min="1"
                value={form.maxUses}
                onChange={(e) => setField("maxUses", e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Unlimited"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Expires</label>
              <input
                type="date"
                value={form.expiresAt}
                onChange={(e) => setField("expiresAt", e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {formError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {formError}
            </p>
          )}
        </div>
      </FormDrawer>
    </div>
  );
}
