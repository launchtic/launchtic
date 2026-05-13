"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Key, CheckCircle, XCircle, Loader2 } from "lucide-react";

type LicenseStatus = {
  plan: string;
  licenseKey: string | null;
  expiresAt: string | null;
  isExpired: boolean;
};

export default function LicensePanel() {
  const { update } = useSession();
  const router = useRouter();
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [keyInput, setKeyInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/license")
      .then((r) => r.json())
      .then((r) => { if (r.success) setStatus(r.data); })
      .finally(() => setLoading(false));
  }, []);

  async function activate() {
    if (!keyInput.trim()) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/license", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenseKey: keyInput.trim() }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error ?? "Failed to activate license.");
      } else {
        const newPlan = data.data.plan;
        setSuccess(`License activated! Plan: ${newPlan}`);
        setKeyInput("");
        setStatus((prev) => prev ? { ...prev, plan: newPlan, licenseKey: "LT-••••••••", expiresAt: data.data.expiresAt, isExpired: false } : prev);
        // Update session immediately — no re-login needed.
        await update({ workspacePlan: newPlan });
        router.refresh();
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const planColor: Record<string, string> = {
    FREE: "bg-gray-100 text-gray-600",
    PRO: "bg-blue-100 text-blue-700",
    ENTERPRISE: "bg-purple-100 text-purple-700",
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 size={14} className="animate-spin" /> Loading...
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="text-base font-semibold text-gray-900">License</h2>
        <p className="text-sm text-gray-500 mt-1">
          Activate a Pro or Enterprise license key to unlock advanced features.
        </p>
      </div>

      {/* Current plan */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Current Plan</p>
          <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${planColor[status?.plan ?? "FREE"] ?? planColor.FREE}`}>
            {status?.plan ?? "FREE"}
          </span>
          {status?.expiresAt && (
            <p className="text-xs text-gray-400 mt-1.5">
              {status.isExpired ? "Expired" : "Expires"} {new Date(status.expiresAt).toLocaleDateString()}
            </p>
          )}
        </div>
        {status?.plan !== "FREE" ? (
          <CheckCircle size={20} className="text-green-500" />
        ) : (
          <XCircle size={20} className="text-gray-300" />
        )}
      </div>

      {/* Active key */}
      {status?.licenseKey && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">License Key</p>
          <code className="text-sm font-mono text-gray-700">{status.licenseKey}</code>
        </div>
      )}

      {/* Activate form */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <p className="text-sm font-medium text-gray-700">
          {status?.licenseKey ? "Update License Key" : "Activate License Key"}
        </p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Key size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="LT-PRO-xxxxxxxxxxxx"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              onKeyDown={(e) => e.key === "Enter" && activate()}
            />
          </div>
          <button
            onClick={activate}
            disabled={saving || !keyInput.trim()}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            Activate
          </button>
        </div>

        {error && (
          <p className="text-xs text-red-600 flex items-center gap-1.5">
            <XCircle size={12} /> {error}
          </p>
        )}
        {success && (
          <p className="text-xs text-green-600 flex items-center gap-1.5">
            <CheckCircle size={12} /> {success}
          </p>
        )}
      </div>

      {/* Upgrade CTA */}
      {status?.plan === "FREE" && (
        <p className="text-xs text-gray-400">
          Don&apos;t have a license?{" "}
          <a
            href="https://launchtic.com/pricing"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            Get Pro — $249/year →
          </a>
        </p>
      )}
    </div>
  );
}
