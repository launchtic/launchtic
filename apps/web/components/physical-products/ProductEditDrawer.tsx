"use client";

import { useState, useEffect } from "react";
import { GripVertical, Plus, Trash2, Loader2 } from "lucide-react";
import { SUPPORTED_CURRENCIES } from "@launchtic/types";
import FormDrawer from "../ui/FormDrawer";

type ProductVariant = {
  id: string;
  name: string;
  combination: string[];
  sku: string;
  price: string;
  image: string | null;
};

type ProductOption = {
  id: string;
  name: string;
  values: string[];
};

type Product = {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  price: number;
  currency: string;
  weight: number | null;
  limitStock: boolean;
  stockLimit: number | null;
  images: unknown;
  hasOptions: boolean;
  options: unknown;
  variants: unknown;
};

type FormState = {
  name: string;
  description: string;
  sku: string;
  price: string;
  currency: string;
  weight: string;
  limitStock: boolean;
  stockLimit: string;
  images: string[];
  hasOptions: boolean;
  options: ProductOption[];
  variants: ProductVariant[];
};

const CURRENCIES = SUPPORTED_CURRENCIES;

const inputCls = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base sm:text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400";

function cartesian(arrays: string[][]): string[][] {
  return arrays.reduce<string[][]>(
    (acc, arr) => acc.flatMap((combo) => arr.map((v) => [...combo, v])),
    [[]]
  );
}

function generateSku(combo: string[]): string {
  const prefix = combo
    .map((v) => v.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3))
    .join("-");
  const suffix = Math.floor(100 + Math.random() * 900).toString();
  return `${prefix}-${suffix}`;
}

function buildVariants(options: ProductOption[], basePriceDollars: string): ProductVariant[] {
  const groups = options.filter((o) => o.name.trim() && o.values.some((v) => v.trim()));
  if (groups.length === 0) return [];
  const valueSets = groups.map((g) => g.values.filter((v) => v.trim()));
  return cartesian(valueSets).map((combo) => ({
    id: Math.random().toString(36).slice(2),
    name: combo.join("/"),
    combination: combo,
    sku: generateSku(combo),
    price: basePriceDollars,
    image: null,
  }));
}

function newOption(): ProductOption {
  return { id: Math.random().toString(36).slice(2), name: "", values: [""] };
}

function productToForm(p: Product): FormState {
  return {
    name: p.name,
    description: p.description ?? "",
    sku: p.sku ?? "",
    price: (p.price / 100).toString(),
    currency: p.currency,
    weight: p.weight?.toString() ?? "",
    limitStock: p.limitStock,
    stockLimit: p.stockLimit?.toString() ?? "",
    images: Array.isArray(p.images) ? (p.images as string[]) : [],
    hasOptions: p.hasOptions,
    options: Array.isArray(p.options)
      ? (p.options as any[]).map((o: any) => ({
          id: o.id ?? Math.random().toString(36).slice(2),
          name: o.name ?? "",
          values: Array.isArray(o.values) ? o.values : [""],
        }))
      : [],
    variants: Array.isArray(p.variants)
      ? (p.variants as any[]).map((v: any) => ({
          id: v.id ?? Math.random().toString(36).slice(2),
          name: v.name ?? "",
          combination: v.combination ?? [],
          sku: v.sku ?? "",
          price: v.price != null ? (v.price / 100).toString() : "",
          image: v.image ?? null,
        }))
      : [],
  };
}

function VariantImageUpload({ image, onUpload }: { image: string | null; onUpload: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/media/upload", { method: "POST", body: fd }).then((r) => r.json());
      const url = res.data?.url ?? res.url;
      if (url) onUpload(url);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <label className="relative w-12 h-12 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors overflow-hidden shrink-0 group">
      <input type="file" accept="image/*" className="sr-only" onChange={handleFile} />
      {image ? (
        <img src={image} alt="" className="w-full h-full object-cover" />
      ) : uploading ? (
        <Loader2 size={14} className="text-blue-400 animate-spin" />
      ) : (
        <Plus size={14} className="text-gray-300 group-hover:text-blue-400 transition-colors" />
      )}
    </label>
  );
}

function MediaTab({ images, onChange }: { images: string[]; onChange: (imgs: string[]) => void }) {
  const [uploading, setUploading] = useState(false);

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/media/upload", { method: "POST", body: fd }).then((r) => r.json());
        const url = res.data?.url ?? res.url;
        if (url) urls.push(url);
      }
      if (urls.length) onChange([...images, ...urls]);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  function remove(idx: number) { onChange(images.filter((_, i) => i !== idx)); }

  function moveToFirst(idx: number) {
    if (idx === 0) return;
    const next = [...images];
    next.unshift(next.splice(idx, 1)[0]);
    onChange(next);
  }

  const [primary, ...rest] = images;

  return (
    <div className="space-y-4">
      <div className="relative group w-full h-64 rounded-xl overflow-hidden border border-gray-200 bg-gray-50 flex items-center justify-center">
        {primary ? (
          <>
            <img src={primary} alt="" className="w-full h-full object-contain" />
            <button
              type="button"
              onClick={() => remove(0)}
              className="absolute top-2 right-2 p-1.5 bg-white/80 hover:bg-red-50 text-gray-500 hover:text-red-500 rounded-lg transition-all"
            >
              <Trash2 size={14} />
            </button>
          </>
        ) : (
          <label className="flex flex-col items-center justify-center gap-2 cursor-pointer w-full h-full">
            <input type="file" accept="image/*" multiple className="sr-only" onChange={handleFiles} />
            <Plus size={24} className="text-gray-300" />
            <span className="text-sm text-gray-400">Upload primary image</span>
          </label>
        )}
      </div>

      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
        {rest.map((url, i) => (
          <div key={url} className="relative group aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
            <img src={url} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-start justify-end p-1 gap-1">
              <button
                type="button"
                onClick={() => moveToFirst(i + 1)}
                title="Set as primary"
                className="p-1 bg-white/80 hover:bg-blue-50 text-gray-600 hover:text-blue-600 rounded text-xs"
              >
                ★
              </button>
              <button
                type="button"
                onClick={() => remove(i + 1)}
                className="p-1 bg-white/80 hover:bg-red-50 text-gray-600 hover:text-red-500 rounded"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
        <label className="aspect-square rounded-lg border-2 border-dashed border-gray-200 flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors gap-1">
          <input type="file" accept="image/*" multiple className="sr-only" onChange={handleFiles} disabled={uploading} />
          {uploading ? <Loader2 size={16} className="text-blue-400 animate-spin" /> : <Plus size={16} className="text-gray-300" />}
          <span className="text-[10px] text-gray-400">Add image</span>
        </label>
      </div>
    </div>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
  productId: string | null;
  onSaved?: () => void;
};

export default function ProductEditDrawer({ open, onClose, productId, onSaved }: Props) {
  const TABS = [
    { id: "details"  as const, label: "Details"  },
    { id: "media"    as const, label: "Media"    },
    { id: "variants" as const, label: "Variants" },
  ];
  type TabId = typeof TABS[number]["id"];

  const [form, setForm] = useState<FormState | null>(null);
  const [productName, setProductName] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabId>("details");
  const [selectedVariantIds, setSelectedVariantIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open || !productId) return;
    setForm(null);
    setError("");
    setTab("details");
    setSelectedVariantIds(new Set());
    setLoading(true);
    fetch(`/api/physical-products/${productId}`)
      .then((r) => r.json())
      .then((p: Product | { error: string }) => {
        if ("error" in p) { setError(p.error); return; }
        setProductName(p.name);
        setForm(productToForm(p));
      })
      .catch(() => setError("Failed to load product"))
      .finally(() => setLoading(false));
  }, [open, productId]);

  function setField<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => f ? { ...f, [k]: v } : f);
  }

  async function handleSave() {
    if (!form || !productId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/physical-products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description || null,
          sku: form.sku || null,
          price: parseFloat(form.price) || 0,
          currency: form.currency,
          weight: form.weight ? parseFloat(form.weight) : null,
          limitStock: form.limitStock,
          stockLimit: form.limitStock && form.stockLimit ? parseInt(form.stockLimit) : null,
          images: form.images,
          hasOptions: form.hasOptions,
          options: form.hasOptions ? form.options.filter((o) => o.name.trim()) : null,
          variants:
            form.hasOptions && form.variants.length > 0
              ? form.variants.map((v) => ({
                  ...v,
                  price: v.price ? Math.round(parseFloat(v.price) * 100) : null,
                }))
              : null,
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        setError(json.error ?? "Failed to save product");
        return;
      }
      onSaved?.();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormDrawer
      open={open}
      onClose={onClose}
      title={productName || "Edit Product"}
      description="Update product details, media, and variants"
      width="xl"
      submitLabel="Save Changes"
      submitting={saving}
      submitDisabled={!form || !form.name.trim() || loading}
      onSubmit={handleSave}
    >
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={20} className="animate-spin text-gray-400" />
        </div>
      ) : !form ? (
        error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>
        ) : null
      ) : (
        <div className="space-y-5">
          {/* Tab bar */}
          <div className="flex gap-1 -mx-5 sm:-mx-6 px-5 sm:px-6 overflow-x-auto">
            {TABS.map((tab_item) => (
              <button
                key={tab_item.id}
                type="button"
                onClick={() => setTab(tab_item.id)}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap -mb-px ${
                  tab === tab_item.id
                    ? "border-blue-600 text-blue-700"
                    : "border-transparent text-gray-500 hover:text-gray-900"
                }`}
              >
                {tab_item.label}
              </button>
            ))}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>
          )}

          {tab === "details" && (
            <div className="space-y-6">
              <Section title="General">
                <Field label="Name" required>
                  <input className={inputCls} placeholder="Product name" value={form.name} onChange={(e) => setField("name", e.target.value)} />
                </Field>
                <Field label="Description">
                  <textarea
                    className={`${inputCls} min-h-[90px] resize-none`}
                    placeholder="Describe your product"
                    value={form.description}
                    onChange={(e) => setField("description", e.target.value)}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="SKU">
                    <input className={inputCls} placeholder="SKU-001" value={form.sku} onChange={(e) => setField("sku", e.target.value)} />
                  </Field>
                  <Field label="Weight (kg)">
                    <input
                      type="number"
                      min="0"
                      className={inputCls}
                      placeholder="0.0"
                      value={form.weight}
                      onChange={(e) => setField("weight", e.target.value)}
                    />
                  </Field>
                </div>
              </Section>

              <Section title="Pricing">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Currency">
                    <select className={inputCls} value={form.currency} onChange={(e) => setField("currency", e.target.value)}>
                      {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Base price">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className={inputCls}
                      value={form.price}
                      onChange={(e) => setField("price", e.target.value)}
                    />
                  </Field>
                </div>
              </Section>

              <Section title="Inventory">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="limitStock"
                    checked={form.limitStock}
                    onChange={(e) => setField("limitStock", e.target.checked)}
                    className="w-4 h-4 accent-blue-600"
                  />
                  <label htmlFor="limitStock" className="text-sm cursor-pointer">Limit stock</label>
                  {form.limitStock && (
                    <input
                      type="number"
                      min="0"
                      className="ml-2 border border-gray-200 rounded-xl px-3 py-2 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Stock limit"
                      value={form.stockLimit}
                      onChange={(e) => setField("stockLimit", e.target.value)}
                    />
                  )}
                </div>
              </Section>
            </div>
          )}

          {tab === "media" && (
            <MediaTab images={form.images} onChange={(imgs) => setField("images", imgs)} />
          )}

          {tab === "variants" && (
            <VariantsSection
              form={form}
              setForm={setForm}
              selectedVariantIds={selectedVariantIds}
              setSelectedVariantIds={setSelectedVariantIds}
            />
          )}
        </div>
      )}
    </FormDrawer>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-700">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function VariantsSection({
  form, setForm, selectedVariantIds, setSelectedVariantIds,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState | null>>;
  selectedVariantIds: Set<string>;
  setSelectedVariantIds: React.Dispatch<React.SetStateAction<Set<string>>>;
}) {
  const hasValidOptions = form.options.some((o) => o.name.trim() && o.values.some((v) => v.trim()));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="hasOptions"
          checked={form.hasOptions}
          onChange={(e) => {
            const checked = e.target.checked;
            setForm((f) => f ? {
              ...f,
              hasOptions: checked,
              options: checked && f.options.length === 0 ? [newOption()] : f.options,
            } : f);
          }}
          className="w-4 h-4 accent-blue-600"
        />
        <label htmlFor="hasOptions" className="text-sm cursor-pointer">
          This product has options (e.g. size, color)
        </label>
      </div>

      {form.hasOptions && (
        <>
          <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
            {form.options.map((opt) => (
              <div key={opt.id} className="border-b border-gray-200 last:border-b-0 p-4 bg-white">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">Option name</label>
                    <div className="flex items-center gap-2">
                      <input
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g. Size, Color"
                        value={opt.name}
                        onChange={(e) => {
                          const val = e.target.value;
                          setForm((f) => f ? {
                            ...f,
                            options: f.options.map((o) => o.id === opt.id ? { ...o, name: val } : o),
                          } : f);
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setForm((f) => f ? { ...f, options: f.options.filter((o) => o.id !== opt.id) } : f)}
                        className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
                <label className="block text-xs text-gray-500 mb-2">Option values</label>
                <div className="space-y-2">
                  {opt.values.map((val, vi) => (
                    <div key={vi} className="flex items-center gap-2">
                      <GripVertical size={14} className="text-gray-300 shrink-0" />
                      <input
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        placeholder={vi === opt.values.length - 1 ? "Add another value…" : ""}
                        value={val}
                        onChange={(e) => {
                          const v = e.target.value;
                          setForm((f) => f ? {
                            ...f,
                            options: f.options.map((o) =>
                              o.id === opt.id
                                ? { ...o, values: o.values.map((vv, vvi) => (vvi === vi ? v : vv)) }
                                : o
                            ),
                          } : f);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            setForm((f) => f ? {
                              ...f,
                              options: f.options.map((o) =>
                                o.id === opt.id ? { ...o, values: [...o.values, ""] } : o
                              ),
                            } : f);
                          }
                          if (e.key === "Backspace" && val === "" && opt.values.length > 1) {
                            e.preventDefault();
                            setForm((f) => f ? {
                              ...f,
                              options: f.options.map((o) =>
                                o.id === opt.id
                                  ? { ...o, values: o.values.filter((_, vvi) => vvi !== vi) }
                                  : o
                              ),
                            } : f);
                          }
                        }}
                      />
                      {opt.values.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setForm((f) => f ? {
                              ...f,
                              options: f.options.map((o) =>
                                o.id === opt.id
                                  ? { ...o, values: o.values.filter((_, vvi) => vvi !== vi) }
                                  : o
                              ),
                            } : f)
                          }
                          className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                  {opt.values[opt.values.length - 1] !== "" && (
                    <div className="flex items-center gap-2">
                      <GripVertical size={14} className="text-gray-200 shrink-0" />
                      <input
                        className="flex-1 border border-dashed border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-400 focus:outline-none cursor-pointer bg-white"
                        placeholder="Add another value…"
                        readOnly
                        onClick={() =>
                          setForm((f) => f ? {
                            ...f,
                            options: f.options.map((o) =>
                              o.id === opt.id ? { ...o, values: [...o.values, ""] } : o
                            ),
                          } : f)
                        }
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div className="p-3 bg-gray-50">
              <button
                type="button"
                onClick={() => setForm((f) => f ? { ...f, options: [...f.options, newOption()] } : f)}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              >
                <Plus size={14} /> Add another option
              </button>
            </div>
          </div>

          {hasValidOptions && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold">Variants</p>
                  {selectedVariantIds.size === 0 ? (
                    <p className="text-xs text-gray-400 mt-0.5">Select variants to bulk-delete</p>
                  ) : (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-gray-500">{selectedVariantIds.size} selected</span>
                      <button
                        type="button"
                        onClick={() => {
                          setForm((f) => f ? { ...f, variants: f.variants.filter((v) => !selectedVariantIds.has(v.id)) } : f);
                          setSelectedVariantIds(new Set());
                        }}
                        className="text-xs font-medium px-3 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const generated = buildVariants(form.options, form.price);
                    setForm((f) => f ? {
                      ...f,
                      variants: generated.map((g) => {
                        const existing = f.variants.find((v) => v.name === g.name);
                        return existing
                          ? { ...g, id: existing.id, sku: existing.sku, price: existing.price, image: existing.image }
                          : g;
                      }),
                    } : f);
                    setSelectedVariantIds(new Set());
                  }}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium border border-blue-200 rounded-lg px-3 py-1.5"
                >
                  Regenerate
                </button>
              </div>

              {form.variants.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setForm((f) => f ? { ...f, variants: buildVariants(f.options, f.price) } : f)}
                  className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                >
                  <Plus size={14} className="inline mr-1" /> Generate variants
                </button>
              ) : (
                <div className="border border-gray-200 rounded-xl overflow-hidden overflow-x-auto">
                  <table className="w-full text-sm min-w-[480px]">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-3 py-2.5 w-8">
                          <input
                            type="checkbox"
                            className="w-3.5 h-3.5 accent-blue-600"
                            checked={form.variants.length > 0 && selectedVariantIds.size === form.variants.length}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedVariantIds(new Set(form.variants.map((v) => v.id)));
                              else setSelectedVariantIds(new Set());
                            }}
                          />
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-16">Image</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Variant</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 hidden sm:table-cell">SKU</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                          Price ({form.currency.toUpperCase()})
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.variants.map((variant, vi) => {
                        const isSelected = selectedVariantIds.has(variant.id);
                        return (
                          <tr
                            key={variant.id}
                            className={`border-b border-gray-100 last:border-b-0 transition-colors ${isSelected ? "bg-blue-50/50" : "hover:bg-gray-50"}`}
                          >
                            <td className="px-3 py-2.5">
                              <input
                                type="checkbox"
                                className="w-3.5 h-3.5 accent-blue-600"
                                checked={isSelected}
                                onChange={(e) => {
                                  setSelectedVariantIds((prev) => {
                                    const next = new Set(prev);
                                    if (e.target.checked) next.add(variant.id);
                                    else next.delete(variant.id);
                                    return next;
                                  });
                                }}
                              />
                            </td>
                            <td className="px-3 py-2.5">
                              <VariantImageUpload
                                image={variant.image}
                                onUpload={(url) =>
                                  setForm((f) => f ? {
                                    ...f,
                                    variants: f.variants.map((v, i) => (i === vi ? { ...v, image: url } : v)),
                                  } : f)
                                }
                              />
                            </td>
                            <td className={`px-3 py-2.5 font-medium ${isSelected ? "text-gray-400 line-through" : "text-gray-800"}`}>
                              {variant.name}
                            </td>
                            <td className="px-3 py-2.5 hidden sm:table-cell">
                              <input
                                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40 disabled:bg-gray-50"
                                placeholder="SKU"
                                value={variant.sku}
                                disabled={isSelected}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setForm((f) => f ? {
                                    ...f,
                                    variants: f.variants.map((v, i) => (i === vi ? { ...v, sku: val } : v)),
                                  } : f);
                                }}
                              />
                            </td>
                            <td className="px-3 py-2.5">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40 disabled:bg-gray-50"
                                value={variant.price}
                                disabled={isSelected}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setForm((f) => f ? {
                                    ...f,
                                    variants: f.variants.map((v, i) => (i === vi ? { ...v, price: val } : v)),
                                  } : f);
                                }}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
