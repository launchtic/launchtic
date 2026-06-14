"use client";

import { useState, useMemo } from "react";
import { HardDrive, Cloud, Check, Loader2, Eye, EyeOff, Zap, XCircle, AlertTriangle } from "lucide-react";
import { apiFetch } from "../../lib/api-client";
import { useRole } from "../../lib/role";

type Driver = "local" | "s3";

interface StorageData {
  driver: Driver;
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;   // plaintext — hidden behind password input + eye toggle
  publicUrl: string;
}

const inputCls =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white " +
  "focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400";

function LabelRow({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="mb-1">
      <span className="text-xs font-semibold text-gray-600">{label}</span>
      {hint && <span className="ml-2 text-[11px] text-gray-400">{hint}</span>}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <LabelRow label={label} hint={hint} />
      {children}
    </div>
  );
}

function SecretField({ value, onChange, placeholder, disabled }: { value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "••••••••"}
        disabled={disabled}
        // Anti-autofill: "new-password" tells Chrome this is NOT a login form
        // so it won't stuff the saved-account password into the field.
        autoComplete="new-password"
        name="storage-secret-key"
        data-form-type="other"
        className={inputCls + " pr-9" + (disabled ? " bg-gray-50 cursor-not-allowed text-gray-500" : "")}
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
      >
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

interface AssetCounts {
  local: number;
  s3: number;
}

export default function StoragePanel({
  initial,
  assetCounts,
}: {
  initial: StorageData | null;
  assetCounts?: AssetCounts;
}) {
  const { isOwner } = useRole();
  // Storage is org-wide infra — owner-only. Non-owners see the page in read-
  // only mode (server already gates the route, this is a defense-in-depth).
  const def = initial ?? { driver: "local", endpoint: "", region: "", bucket: "", accessKey: "", secretKey: "", publicUrl: "" };

  const [driver, setDriver] = useState<Driver>(def.driver);
  const [endpoint, setEndpoint]   = useState(def.endpoint);
  const [region, setRegion]       = useState(def.region);
  const [bucket, setBucket]       = useState(def.bucket);
  const [accessKey, setAccessKey] = useState(def.accessKey);
  const [secretKey, setSecretKey] = useState(def.secretKey);
  const [publicUrl, setPublicUrl] = useState(def.publicUrl);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // ── Destructive-change detection ─────────────────────────────────────────
  // A change is "destructive" if it would prevent existing assets from being
  // served via the same URL. Rotating secretKey on the same bucket is fine
  // (URLs unchanged). Changing publicUrl alone is fine too (CDN swap). But
  // changing driver / bucket / endpoint / region / accessKey means existing
  // asset URLs may 404 because they point at the old infra.
  const destructive = useMemo(() => {
    if (!initial) return false; // first-time setup, nothing to break
    return (
      driver    !== initial.driver    ||
      endpoint  !== initial.endpoint  ||
      region    !== initial.region    ||
      bucket    !== initial.bucket    ||
      accessKey !== initial.accessKey
    );
  }, [initial, driver, endpoint, region, bucket, accessKey]);

  const totalAssets    = (assetCounts?.local ?? 0) + (assetCounts?.s3 ?? 0);
  const showWarning    = destructive && totalAssets > 0;

  // Open modal first if destructive + assets exist; otherwise save directly.
  const handleSave = () => {
    if (showWarning) { setConfirmOpen(true); return; }
    doSave();
  };

  const doSave = async () => {
    setConfirmOpen(false);
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch("/api/settings/storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driver, endpoint, region, bucket, accessKey, secretKey: secretKey || "__KEEP__", publicUrl }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Failed to save");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setError("");
    try {
      const res = await apiFetch("/api/settings/storage/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driver, endpoint, region, bucket, accessKey, secretKey: secretKey || "__KEEP__", publicUrl }),
      });
      const json = await res.json();
      if (!json.success) {
        setTestResult({ success: false, message: json.error ?? "Test failed" });
        return;
      }
      const d = json.data;
      setTestResult({ success: d.success, message: d.message });
    } catch (e: any) {
      setTestResult({ success: false, message: e?.message ?? "Test failed" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-900 mb-1">Storage</h2>
      <p className="text-xs text-gray-400 mb-5">
        Where uploaded media is stored. Applies to <span className="font-medium text-gray-600">every workspace in this organization</span> — files isolated per-workspace via path prefix. Owner-only.
      </p>

      {/* Driver toggle */}
      <div className="flex gap-3 mb-6">
        {([
          { id: "local", label: "Local disk", icon: HardDrive, desc: "Zero-config, files saved on server" },
          { id: "s3",    label: "S3-compatible", icon: Cloud,      desc: "AWS S3, Cloudflare R2, MinIO, …"  },
        ] as { id: Driver; label: string; icon: React.ElementType; desc: string }[]).map(({ id, label, icon: Icon, desc }) => (
          <button
            key={id}
            onClick={() => setDriver(id)}
            disabled={!isOwner}
            className={`flex-1 flex flex-col items-start gap-1 p-3.5 rounded-xl border-2 text-left transition-colors ${
              driver === id ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"
            } ${!isOwner ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            <div className="flex items-center gap-2">
              <Icon size={15} className={driver === id ? "text-blue-600" : "text-gray-500"} />
              <span className={`text-sm font-semibold ${driver === id ? "text-blue-700" : "text-gray-700"}`}>{label}</span>
            </div>
            <span className="text-[11px] text-gray-400">{desc}</span>
          </button>
        ))}
      </div>

      {driver === "s3" && (
        // autoComplete="off" on every input below — Chrome's username/password
        // heuristic was matching "Access Key ID" as login email and stuffing
        // saved credentials in.
        <div className="space-y-0">
          <Field label="Endpoint URL" hint="Leave empty for AWS S3">
            <input
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://{accountId}.r2.cloudflarestorage.com"
              disabled={!isOwner}
              autoComplete="off"
              name="storage-endpoint"
              className={inputCls + (!isOwner ? " bg-gray-50 cursor-not-allowed text-gray-500" : "")}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Region">
              <input
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="us-east-1"
                disabled={!isOwner}
                autoComplete="off"
                name="storage-region"
                className={inputCls + (!isOwner ? " bg-gray-50 cursor-not-allowed text-gray-500" : "")}
              />
            </Field>
            <Field label="Bucket name">
              <input
                value={bucket}
                onChange={(e) => setBucket(e.target.value)}
                placeholder="my-bucket"
                disabled={!isOwner}
                autoComplete="off"
                name="storage-bucket"
                className={inputCls + (!isOwner ? " bg-gray-50 cursor-not-allowed text-gray-500" : "")}
              />
            </Field>
          </div>

          <Field label="Access Key ID">
            <input
              value={accessKey}
              onChange={(e) => setAccessKey(e.target.value)}
              placeholder="AKIAIOSFODNN7EXAMPLE"
              disabled={!isOwner}
              autoComplete="off"
              name="storage-access-key"
              data-form-type="other"
              className={inputCls + (!isOwner ? " bg-gray-50 cursor-not-allowed text-gray-500" : "")}
            />
          </Field>

          <Field label="Secret Access Key">
            <SecretField
              value={secretKey}
              onChange={setSecretKey}
              placeholder="wJalrXUtnFEMI/..."
              disabled={!isOwner}
            />
          </Field>

          <Field label="Public URL" hint="Optional — CDN or public bucket URL">
            <input
              value={publicUrl}
              onChange={(e) => setPublicUrl(e.target.value)}
              placeholder="https://cdn.example.com"
              disabled={!isOwner}
              autoComplete="off"
              name="storage-public-url"
              className={inputCls + (!isOwner ? " bg-gray-50 cursor-not-allowed text-gray-500" : "")}
            />
          </Field>
        </div>
      )}

      {error && (
        <p className="mt-3 text-xs text-red-500">{error}</p>
      )}

      {testResult && (
        <div className={`mt-3 flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs ${
          testResult.success
            ? "bg-green-50 text-green-700 border border-green-100"
            : "bg-red-50 text-red-600 border border-red-100"
        }`}>
          {testResult.success
            ? <Check size={14} className="mt-0.5 shrink-0 text-green-600" />
            : <XCircle size={14} className="mt-0.5 shrink-0 text-red-500" />}
          <span className="break-all">{testResult.message}</span>
        </div>
      )}

      {showWarning && (
        <div className="mt-4 flex items-start gap-2.5 px-3.5 py-3 rounded-lg bg-amber-50 border border-amber-200">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600" />
          <div className="text-xs leading-relaxed text-amber-900">
            <p className="font-semibold mb-1">
              You have {totalAssets} existing asset{totalAssets === 1 ? "" : "s"} on the current storage.
            </p>
            <p className="text-amber-800">
              {assetCounts?.local ? `${assetCounts.local} on local disk` : ""}
              {assetCounts?.local && assetCounts?.s3 ? " · " : ""}
              {assetCounts?.s3 ? `${assetCounts.s3} on S3` : ""}
              {". "}
              These files <span className="font-medium">won&apos;t be migrated</span> when you save —
              keep the previous bucket / disk accessible or those asset URLs will 404.
              Migrate manually if you need everything on the new storage.
            </p>
          </div>
        </div>
      )}

      {isOwner && (
        <div className="mt-5 flex items-center gap-2">
          <button
            onClick={handleTest}
            disabled={testing || saving}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60"
          >
            {testing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            {testing ? "Testing…" : "Test connection"}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || testing}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-60"
            style={{ background: saved ? "#16a34a" : "#2563eb" }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : null}
            {saved ? "Saved!" : saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}

      {/* Destructive-change confirmation modal */}
      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
                <AlertTriangle size={16} className="text-amber-600" />
              </div>
              <h2 className="text-sm font-semibold text-gray-900">Change storage configuration?</h2>
            </div>

            <p className="text-sm text-gray-600 mb-2">
              This will leave{" "}
              <span className="font-semibold text-gray-900">
                {totalAssets} existing asset{totalAssets === 1 ? "" : "s"}
              </span>{" "}
              on the old storage.
            </p>

            <div className="mb-3 px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg text-xs text-gray-600 space-y-0.5">
              {assetCounts?.local ? (
                <div className="flex items-center gap-2">
                  <HardDrive size={12} className="text-gray-400" />
                  <span><span className="font-medium text-gray-800">{assetCounts.local}</span> on local disk</span>
                </div>
              ) : null}
              {assetCounts?.s3 ? (
                <div className="flex items-center gap-2">
                  <Cloud size={12} className="text-gray-400" />
                  <span><span className="font-medium text-gray-800">{assetCounts.s3}</span> on S3</span>
                </div>
              ) : null}
            </div>

            <p className="text-xs text-gray-500 leading-relaxed mb-5">
              They <span className="font-medium text-gray-700">won&apos;t be migrated</span> automatically.
              Keep the previous bucket / disk accessible or those asset URLs will return 404.
              Migrate manually if you need everything on the new storage.
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="flex-1 px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={doSave}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-colors"
              >
                Continue &amp; save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
