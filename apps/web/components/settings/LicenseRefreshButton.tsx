"use client";

import { useState } from "react";
import { RefreshCw, Loader2 } from "lucide-react";
import { apiFetch } from "../../lib/api-client";

// Single action that re-checks the license (plan + update window, bypassing the
// 24h gate) AND busts the cached latest-version, then reloads so both the
// License and Version panels show fresh data in one click.
export default function LicenseRefreshButton() {
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setRefreshing(true);
    setError(null);
    try {
      const res = await apiFetch("/api/license/refresh", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json?.error ?? "Could not refresh.");
        setRefreshing(false);
        return;
      }
      window.location.reload();
    } catch {
      setError("Network error. Please try again.");
      setRefreshing(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        onClick={refresh}
        disabled={refreshing}
        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60"
      >
        {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        {refreshing ? "Refreshing…" : "Refresh status"}
      </button>
    </div>
  );
}
