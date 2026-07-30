"use client";

import { useState } from "react";
import { X, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../lib/api-client";

// CUSTOM = generic static page (About / Privacy / Terms / Contact / FAQ).
// UPSELL/DOWNSELL = one-click post-purchase offers (charge the saved card).
const STEP_TYPES = [
  { value: "OPTIN",    label: "Opt-in" },
  { value: "SALES",    label: "Sales" },
  { value: "CHECKOUT", label: "Checkout" },
  { value: "UPSELL",   label: "Upsell" },
  { value: "DOWNSELL", label: "Downsell" },
  { value: "THANKYOU", label: "Thank You" },
  { value: "CUSTOM",   label: "Custom page" },
];

export default function AddStepDialog({ funnelId, fullWidth, onAdded }: { funnelId: string; fullWidth?: boolean; onAdded?: (step: { id: string; name: string; slug: string; type: string; order: number; hasContent?: boolean }) => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState("OPTIN");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Slug is auto-generated server-side from `name` and uniqueness-resolved
    // across the funnel's URL space. Users edit the slug later in step settings.
    const res = await apiFetch(`/api/funnels/${funnelId}/steps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, type }),
    });
    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(json.error ?? "Failed to create step");
      return;
    }

    setOpen(false);
    setName(""); setType("OPTIN");
    // Tell the parent which step was created so it can focus/select it. The
    // refresh below then reconciles the list with server data.
    onAdded?.(json.data);
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); setError(null); }}
        className={`flex items-center gap-2 border border-dashed border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600 px-4 py-2 rounded-lg text-sm transition-colors ${fullWidth ? "w-full justify-center" : ""}`}
      >
        <Plus size={15} />
        Add Step
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">Add Step</h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X size={18} />
              </button>
            </div>

            {error && (
              <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Step name</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Opt-in Page"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {STEP_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 justify-end pt-1">
                <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
                >
                  {loading ? "Adding…" : "Add Step"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
