"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2, Lock } from "lucide-react";
import { apiFetch } from "../../lib/api-client";
import type { FunnelAnalytics, FunnelStepStat } from "../../lib/funnel-analytics";

// Date presets → [from, to] computed client-side, sent to the API as ISO.
// "All time" uses a far-back epoch so the server's range filter is inclusive.
type PresetId = "30d" | "month" | "lastMonth" | "all";
const PRESETS: { id: PresetId; label: string }[] = [
  { id: "30d",       label: "Last 30 days" },
  { id: "month",     label: "This month" },
  { id: "lastMonth", label: "Last month" },
  { id: "all",       label: "All time" },
];

function presetRange(id: PresetId): { from: Date; to: Date } {
  const now = new Date();
  const to = now;
  switch (id) {
    case "month":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to };
    case "lastMonth":
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        to:   new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59),
      };
    case "all":
      return { from: new Date(2000, 0, 1), to };
    case "30d":
    default:
      return { from: new Date(now.getTime() - 30 * 86400_000), to };
  }
}

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
function rate(num: number, den: number): string {
  return den > 0 ? `${Math.round((num / den) * 100)}%` : "0%";
}
function dash(value: string, show: boolean): string {
  return show ? value : "—";
}

export default function FunnelAnalyticsView({
  funnelId,
  initial,
  canView = true,
  workspaceSlug,
}: {
  funnelId: string;
  /** Server-provided data (standalone page). When omitted, the component
   *  fetches the default 30-day range on mount — used inside the editor tab. */
  initial?: FunnelAnalytics;
  /** funnelAnalytics plan gate. false → upgrade prompt. */
  canView?: boolean;
  /** Needed for the upgrade link when gated. */
  workspaceSlug?: string;
}) {
  const [data, setData] = useState<FunnelAnalytics | null>(initial ?? null);
  const [preset, setPreset] = useState<PresetId>("30d");
  const [loading, setLoading] = useState(canView && !initial);

  async function applyPreset(id: PresetId) {
    setPreset(id);
    setLoading(true);
    try {
      const { from, to } = presetRange(id);
      const res = await apiFetch(
        `/api/funnels/${funnelId}/analytics?from=${from.toISOString()}&to=${to.toISOString()}`,
      );
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }

  // Self-fetch the default range when no server data was provided (tab usage).
  useEffect(() => {
    if (!canView || initial) return;
    applyPreset("30d");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funnelId, canView]);

  if (!canView) {
    return (
      <div className="max-w-md mx-auto text-center py-12">
        <div className="w-12 h-12 mx-auto rounded-xl bg-gray-100 flex items-center justify-center mb-4">
          <Lock size={20} className="text-gray-400" />
        </div>
        <h3 className="text-base font-semibold text-gray-900 mb-1">Analytics is a Starter feature</h3>
        <p className="text-sm text-gray-500 mb-6">
          See views, conversion, drop-off, and revenue for every step. Available on Starter and above.
        </p>
        {workspaceSlug && (
          <Link
            href={`/${workspaceSlug}/settings/license`}
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-black transition-colors"
          >
            Upgrade to unlock
          </Link>
        )}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <Loader2 size={18} className="animate-spin mr-2" /> Loading analytics…
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Headline metrics + date presets */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex gap-10">
          <div>
            <p className="text-sm text-gray-500">Total sales</p>
            <p className="text-3xl font-bold text-blue-600">{money(data.totals.revenueCents)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Average cart value</p>
            <p className="text-3xl font-bold text-blue-600">{money(data.avgCartValueCents)}</p>
          </div>
        </div>
        <div className="inline-flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p.id)}
              className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                preset === p.id
                  ? "border-blue-500 text-blue-600 bg-blue-50"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats table */}
      <div className={`overflow-x-auto rounded-2xl border border-gray-200 ${loading ? "opacity-50" : ""}`}>
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            {/* Grouped header */}
            <tr className="bg-gray-50 border-b border-gray-100 text-gray-500">
              <th rowSpan={2} className="text-left px-5 py-3 font-medium align-bottom">Step</th>
              <th rowSpan={2} className="px-4 py-3 font-medium align-bottom text-center">Page&nbsp;Views</th>
              <th colSpan={2} className="px-4 py-2 font-medium text-center border-l border-gray-100">Opt-ins</th>
              <th colSpan={3} className="px-4 py-2 font-medium text-center border-l border-gray-100">Sales</th>
              <th rowSpan={2} className="px-4 py-3 font-medium align-bottom text-center border-l border-gray-100">Earnings&nbsp;/&nbsp;view</th>
            </tr>
            <tr className="bg-gray-50 border-b border-gray-100 text-gray-400 text-xs">
              <th className="px-4 py-2 font-medium text-center border-l border-gray-100">All</th>
              <th className="px-4 py-2 font-medium text-center">Conv. rate</th>
              <th className="px-4 py-2 font-medium text-center border-l border-gray-100">Total</th>
              <th className="px-4 py-2 font-medium text-center">Conv. rate</th>
              <th className="px-4 py-2 font-medium text-center">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {data.steps.length === 0 ? (
              <tr><td colSpan={8} className="px-5 py-10 text-center text-gray-400">No steps in this funnel yet.</td></tr>
            ) : (
              data.steps.map((s, i) => <Row key={s.stepId} s={s} odd={i % 2 === 1} />)
            )}
          </tbody>
          {data.steps.length > 0 && (
            <tfoot>
              <tr className="border-t border-gray-200 font-semibold text-gray-900 bg-gray-50/60">
                <td className="px-5 py-3">Total</td>
                <td className="px-4 py-3 text-center">{data.totals.views.toLocaleString()}</td>
                <td className="px-4 py-3 text-center border-l border-gray-100">{data.totals.leads.toLocaleString()}</td>
                <td className="px-4 py-3 text-center">{rate(data.totals.leads, data.totals.views)}</td>
                <td className="px-4 py-3 text-center border-l border-gray-100">{data.totals.purchases.toLocaleString()}</td>
                <td className="px-4 py-3 text-center">{rate(data.totals.purchases, data.totals.views)}</td>
                <td className="px-4 py-3 text-center">{money(data.totals.revenueCents)}</td>
                <td className="px-4 py-3 text-center border-l border-gray-100">
                  {data.totals.views > 0 ? money(Math.round(data.totals.revenueCents / data.totals.views)) : "—"}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
     
    </div>
  );
}

function Row({ s, odd }: { s: FunnelStepStat; odd: boolean }) {
  const hasSales = s.purchases > 0;
  const epvCents = s.views > 0 ? Math.round(s.revenueCents / s.views) : 0;
  return (
    <tr className={odd ? "bg-gray-50/40" : "bg-white"}>
      <td className="px-5 py-3">
        <span className="font-medium text-gray-800">{s.name}</span>
        <span className="ml-2 text-[10px] uppercase tracking-wider text-gray-400">{s.type}</span>
      </td>
      <td className="px-4 py-3 text-center text-gray-700">{s.views.toLocaleString()}</td>
      {/* Opt-ins */}
      <td className="px-4 py-3 text-center border-l border-gray-100 text-gray-700">{s.leads.toLocaleString()}</td>
      <td className="px-4 py-3 text-center text-gray-500">{s.views > 0 ? rate(s.leads, s.views) : "—"}</td>
      {/* Sales */}
      <td className="px-4 py-3 text-center border-l border-gray-100 text-gray-700">{dash(s.purchases.toLocaleString(), hasSales)}</td>
      <td className="px-4 py-3 text-center text-gray-500">{dash(rate(s.purchases, s.views), hasSales && s.views > 0)}</td>
      <td className="px-4 py-3 text-center text-gray-700">{dash(money(s.revenueCents), hasSales)}</td>
      {/* EPV */}
      <td className="px-4 py-3 text-center border-l border-gray-100 text-gray-700">{dash(money(epvCents), hasSales)}</td>
    </tr>
  );
}
