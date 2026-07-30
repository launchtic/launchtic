"use client";

import { useEffect, useState } from "react";
import { Loader2, FlaskConical, Trophy, Pencil, Play, Square } from "lucide-react";
import { apiFetch } from "../../lib/api-client";
import { useConfirm } from "../ui/ConfirmDialog";

type VariantResult = {
  variantId: string;
  name: string;
  isControl: boolean;
  weight: number;
  views: number;
  conversions: number;
  revenueCents: number;
  conversionRate: number;
  uplift: number | null;
  confidence: number | null;
  isWinner: boolean;
};
type AbResults = { stepId: string; active: boolean; variants: VariantResult[] };

function money(c: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(c / 100);
}

export default function AbTestPanel({
  stepId,
  workspaceSlug,
}: {
  stepId: string;
  workspaceSlug: string;
}) {
  const confirm = useConfirm();
  const [data, setData] = useState<AbResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await apiFetch(`/api/funnel-steps/${stepId}/ab`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepId]);

  async function startTest() {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/funnel-steps/${stepId}/ab`, { method: "POST" });
      if (res.ok) setData(await res.json());
    } finally { setBusy(false); }
  }

  async function stopTest() {
    const ok = await confirm({
      title: "Stop A/B test?",
      description: "The step keeps its current page (the control). Variants and their data are discarded.",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/funnel-steps/${stepId}/ab`, { method: "DELETE" });
      if (res.ok) { setData({ stepId, active: false, variants: [] }); }
    } finally { setBusy(false); }
  }

  async function promote(v: VariantResult) {
    const ok = await confirm({
      title: `Promote "${v.name}"?`,
      description: "This page becomes the live step and the test ends. Other variants are discarded.",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/funnel-steps/${stepId}/ab/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId: v.variantId }),
      });
      if (res.ok) setData({ stepId, active: false, variants: [] });
    } finally { setBusy(false); }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 size={18} className="animate-spin mr-2" /> Loading…</div>;
  }

  const active = data?.active && (data?.variants.length ?? 0) > 0;

  // No active test → start CTA.
  if (!active) {
    return (
      <div className="max-w-md mx-auto text-center py-12">
        <div className="w-12 h-12 mx-auto rounded-xl bg-blue-50 flex items-center justify-center mb-4">
          <FlaskConical size={20} className="text-blue-600" />
        </div>
        <h3 className="text-base font-semibold text-gray-900 mb-1">Run an A/B test on this step</h3>
        <p className="text-sm text-gray-500 mb-6">
          We&apos;ll snapshot the current page as the Control and create a Variant B (a copy you can edit).
          Traffic splits 50/50 and conversions are tracked per variant.
        </p>
        <button
          onClick={startTest}
          disabled={busy}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
          Start A/B test
        </button>
      </div>
    );
  }

  // Active test → results table.
  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full bg-green-50 text-green-700 border border-green-100">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> Test running
          </span>
        </div>
        <button
          onClick={stopTest}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
        >
          <Square size={12} /> Stop test
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 text-xs">
              <th className="text-left px-4 py-2.5 font-medium">Variant</th>
              <th className="px-3 py-2.5 font-medium text-center">Split</th>
              <th className="px-3 py-2.5 font-medium text-center">Views</th>
              <th className="px-3 py-2.5 font-medium text-center">Conv.</th>
              <th className="px-3 py-2.5 font-medium text-center">Rate</th>
              <th className="px-3 py-2.5 font-medium text-center">Uplift</th>
              <th className="px-3 py-2.5 font-medium text-center">Confidence</th>
              <th className="px-3 py-2.5 font-medium text-center">Revenue</th>
              <th className="px-3 py-2.5 font-medium text-center"></th>
            </tr>
          </thead>
          <tbody>
            {data!.variants.map((v) => (
              <tr key={v.variantId} className={`border-b border-gray-50 ${v.isWinner ? "bg-green-50/50" : ""}`}>
                <td className="px-4 py-3">
                  <span className="font-medium text-gray-800">{v.name}</span>
                  {v.isControl && <span className="ml-2 text-[10px] uppercase tracking-wider text-gray-400">Control</span>}
                  {v.isWinner && <Trophy size={12} className="inline ml-1.5 text-amber-500" />}
                </td>
                <td className="px-3 py-3 text-center text-gray-500">{v.weight}%</td>
                <td className="px-3 py-3 text-center text-gray-700">{v.views.toLocaleString()}</td>
                <td className="px-3 py-3 text-center text-gray-700">{v.conversions.toLocaleString()}</td>
                <td className="px-3 py-3 text-center font-medium text-gray-900">{(v.conversionRate * 100).toFixed(1)}%</td>
                <td className="px-3 py-3 text-center">
                  {v.uplift === null ? "—" : (
                    <span className={v.uplift >= 0 ? "text-green-600" : "text-red-500"}>
                      {v.uplift >= 0 ? "+" : ""}{(v.uplift * 100).toFixed(0)}%
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 text-center text-gray-500">
                  {v.confidence === null ? "—" : `${(v.confidence * 100).toFixed(0)}%`}
                </td>
                <td className="px-3 py-3 text-center text-gray-700">{money(v.revenueCents)}</td>
                <td className="px-3 py-3 text-center whitespace-nowrap">
                  <a
                    href={`/${workspaceSlug}/editor/${stepId}?variant=${v.variantId}`}
                    className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600"
                  >
                    <Pencil size={11} /> Edit
                  </a>
                  <button
                    onClick={() => promote(v)}
                    disabled={busy}
                    className="ml-3 text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-60"
                  >
                    Promote
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        Confidence is a two-proportion z-test vs the control. A{" "}
        <Trophy size={11} className="inline align-text-bottom text-amber-500" /> winner is flagged when a
        variant beats the control at ≥95% confidence. Edit each variant&apos;s page, then promote the winner
        to make it live.
      </p>
    </div>
  );
}
