"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search, ChevronLeft, ChevronRight, Loader2, Package, Settings, Trash2, Plus,
} from "lucide-react";
import ProductQuickCreateDrawer from "./ProductQuickCreateDrawer";
import ProductEditDrawer from "./ProductEditDrawer";
import { useConfirm } from "../ui/ConfirmDialog";
import { useRole } from "../../lib/role";
import { apiFetch } from "../../lib/api-client";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  price: number;
  currency: string;
  hasOptions: boolean;
  variants: unknown;
  createdAt: string;
};
type PageMeta = { total: number; page: number; pageSize: number; totalPages: number };

function formatPrice(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

export default function ProductsListClient({ initialTotal = 0 }: { initialTotal?: number }) {
  const [items, setItems] = useState<Product[]>([]);
  const [meta, setMeta] = useState<PageMeta>({ total: initialTotal, page: 1, pageSize: 25, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const confirm = useConfirm();
  const { canManageProducts, canDeleteProducts } = useRole();

  const fetchData = useCallback(async (q: string, p: number) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), pageSize: "25" });
    if (q) params.set("search", q);
    const res = await apiFetch(`/api/physical-products?${params}`);
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

  async function handleDelete(product: Product) {
    const ok = await confirm({
      title: `Delete "${product.name}"?`,
      description: "This will permanently delete the product and all its variants.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    setDeleting(product.id);
    await apiFetch(`/api/physical-products/${product.id}`, { method: "DELETE" });
    setDeleting(null);
    fetchData(search, page);
    router.refresh();
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 px-4 sm:px-6 py-4 shrink-0">
        <div className="shrink-0">
          <h1 className="text-xl font-bold text-gray-900">Physical Products</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {meta.total} {meta.total === 1 ? "product" : "products"}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 lg:flex-1 lg:justify-end">
          <div className="relative sm:flex-1 lg:max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search products…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
          {canManageProducts && (
            <button
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors shrink-0"
            >
              <Plus size={16} />
              New Product
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
            <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center mb-3">
              <Package size={20} className="text-orange-500" />
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">No products yet</p>
            <p className="text-xs text-gray-400">
              {search ? "No products match your search" : "Create your first physical product"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <th className="text-left px-6 py-3 font-semibold">Name</th>
                <th className="text-left px-4 py-3 font-semibold">SKU</th>
                <th className="text-right px-4 py-3 font-semibold">Price</th>
                <th className="text-left px-4 py-3 font-semibold">Variants</th>
                <th className="text-left px-4 py-3 font-semibold">Created</th>
                <th className="text-right px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((p) => {
                const variantCount = Array.isArray(p.variants) ? p.variants.length : 0;
                return (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors group cursor-pointer" onClick={() => setEditId(p.id)}>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
                          <Package size={14} className="text-orange-500" />
                        </div>
                        <span className="font-medium text-gray-900 group-hover:text-blue-700 transition-colors truncate">
                          {p.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs font-mono">
                      {p.sku ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {formatPrice(p.price, p.currency)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {p.hasOptions ? `${variantCount} ${variantCount === 1 ? "variant" : "variants"}` : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {new Date(p.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {canManageProducts && (
                          <button
                            onClick={() => setEditId(p.id)}
                            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Edit product"
                          >
                            <Settings size={14} />
                          </button>
                        )}
                        {canDeleteProducts && (
                          <button
                            onClick={() => handleDelete(p)}
                            disabled={deleting === p.id}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                            title="Delete product"
                          >
                            {deleting === p.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
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

      <ProductQuickCreateDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => { setCreateOpen(false); setEditId(id); fetchData(search, page); }}
      />

      <ProductEditDrawer
        open={editId !== null}
        onClose={() => setEditId(null)}
        productId={editId}
        onSaved={() => { fetchData(search, page); }}
      />
    </div>
  );
}
