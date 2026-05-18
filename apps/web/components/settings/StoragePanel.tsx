"use client";

import { useState } from "react";
import { HardDrive, Cloud, Check, Loader2, Eye, EyeOff } from "lucide-react";

type Driver = "local" | "s3";

interface StorageData {
  driver: Driver;
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  publicUrl: string;
}

interface Preset {
  label: string;
  endpoint: string;
  region: string;
  publicUrlHint: string;
}

const S3_PRESETS: Record<string, Preset> = {
  aws: {
    label: "Amazon S3",
    endpoint: "",
    region: "us-east-1",
    publicUrlHint: "https://{bucket}.s3.{region}.amazonaws.com",
  },
  r2: {
    label: "Cloudflare R2",
    endpoint: "https://{accountId}.r2.cloudflarestorage.com",
    region: "auto",
    publicUrlHint: "https://pub-xxx.r2.dev",
  },
  minio: {
    label: "MinIO (self-hosted)",
    endpoint: "http://localhost:9000",
    region: "us-east-1",
    publicUrlHint: "http://localhost:9000/{bucket}",
  },
};

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

function SecretField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "••••••••"}
        className={inputCls + " pr-9"}
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

export default function StoragePanel({ initial }: { initial: StorageData | null }) {
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

  const applyPreset = (key: string) => {
    const p = S3_PRESETS[key];
    if (!p) return;
    setEndpoint(p.endpoint);
    setRegion(p.region);
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/settings/storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driver, endpoint, region, bucket, accessKey, secretKey: secretKey || "__KEEP__", publicUrl }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? "Failed to save");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-900 mb-1">Storage</h2>
      <p className="text-xs text-gray-400 mb-5">
        Choose where uploaded images and media files are stored.
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
            className={`flex-1 flex flex-col items-start gap-1 p-3.5 rounded-xl border-2 text-left transition-colors ${
              driver === id ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"
            }`}
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
        <div className="space-y-0">
          {/* Presets */}
          <div className="mb-4">
            <p className="text-xs font-semibold text-gray-600 mb-2">Quick-fill preset</p>
            <div className="flex gap-2">
              {Object.entries(S3_PRESETS).map(([key, p]) => (
                <button
                  key={key}
                  onClick={() => applyPreset(key)}
                  className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 hover:border-blue-400 hover:text-blue-600 transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <Field label="Endpoint URL" hint="Leave empty for AWS S3">
            <input
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://{accountId}.r2.cloudflarestorage.com"
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Region">
              <input
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="us-east-1"
                className={inputCls}
              />
            </Field>
            <Field label="Bucket name">
              <input
                value={bucket}
                onChange={(e) => setBucket(e.target.value)}
                placeholder="my-bucket"
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Access Key ID">
            <input
              value={accessKey}
              onChange={(e) => setAccessKey(e.target.value)}
              placeholder="AKIAIOSFODNN7EXAMPLE"
              className={inputCls}
            />
          </Field>

          <Field label="Secret Access Key">
            <SecretField
              value={secretKey}
              onChange={setSecretKey}
              placeholder={initial?.secretKey ? "••••••••  (unchanged)" : "wJalrXUtnFEMI/..."}
            />
          </Field>

          <Field label="Public URL" hint="Optional — CDN or public bucket URL">
            <input
              value={publicUrl}
              onChange={(e) => setPublicUrl(e.target.value)}
              placeholder="https://cdn.example.com"
              className={inputCls}
            />
          </Field>
        </div>
      )}

      {error && (
        <p className="mt-3 text-xs text-red-500">{error}</p>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-5 flex items-center justify-center gap-2 w-full py-2 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-60"
        style={{ background: saved ? "#16a34a" : "#2563eb" }}
      >
        {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : null}
        {saved ? "Saved!" : saving ? "Saving…" : "Save storage settings"}
      </button>
    </div>
  );
}
