"use client";

// White Label panel — Agency tier feature. Lets the Organization owner
// override launchtic's logo / name / colors so clients see the agency's
// brand instead. Plan gate + Owner gate live at the page level; by the
// time this renders, both have already passed.

import { useState } from "react";
import { Loader2, Check, Palette, RotateCcw, Plus, Trash2 } from "lucide-react";
import { apiFetch } from "../../lib/api-client";
import { useToast } from "../ui/Toast";
import { useConfirm } from "../ui/ConfirmDialog";

type BrandingConfig = {
  brandName?:    string;
  logoUrl?:      string;
  logoLightUrl?: string;
  faviconUrl?:   string;
};

// Shared input style — mirrors PaymentPanel for consistency across Settings.
// Larger touch targets, rounded-xl, gray-200 border, gray-300 placeholder.
const INPUT_CLS =
  "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 bg-white " +
  "focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-300 transition-colors";

export default function BrandingPanel({
  initial,
}: {
  initial: BrandingConfig;
}) {
  const toast  = useToast();
  const confirm = useConfirm();

  // Local form state — sent to PUT /api/branding on save.
  const [form, setForm] = useState<BrandingConfig>(initial);
  const [saving, setSaving]   = useState(false);
  const [resetting, setReset] = useState(false);

  const set = <K extends keyof BrandingConfig>(k: K, v: BrandingConfig[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function handleSave() {
    setSaving(true);
    const res  = await apiFetch("/api/branding", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      toast.error(json.error ?? "Failed to save branding.");
      return;
    }
    toast.success("Branding saved. Refresh to see changes everywhere.");
  }

  async function handleReset() {
    const ok = await confirm({
      title:        "Reset branding to launchtic defaults?",
      description:  "Removes your logos, colors, and brand name overrides. UI snaps back to default appearance.",
      variant:      "danger",
      confirmLabel: "Reset",
    });
    if (!ok) return;
    setReset(true);
    const res = await apiFetch("/api/branding", { method: "DELETE" });
    setReset(false);
    if (!res.ok) {
      toast.error("Reset failed.");
      return;
    }
    setForm({});
    toast.success("Branding reset.");
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Header />

      <Field
        label="Brand name"
        hint="Shown in the top nav, browser title, and login page."
      >
        <input
          type="text"
          maxLength={60}
          className={INPUT_CLS}
          placeholder="launchtic"
          value={form.brandName ?? ""}
          onChange={(e) => set("brandName", e.target.value)}
        />
      </Field>

      <Field
        label="Primary logo"
        hint="Used on light backgrounds. Recommended 200×40 px."
      >
        <LogoUpload
          value={form.logoUrl ?? ""}
          onChange={(url) => set("logoUrl", url)}
          hint="Click to upload (.png, .svg)"
        />
      </Field>

      <Field
        label="Logo (light)"
        hint="Used on dark backgrounds — Recommended 200×40 px."
      >
        <LogoUpload
          value={form.logoLightUrl ?? ""}
          onChange={(url) => set("logoLightUrl", url)}
          hint="Click to upload (.png, .svg)"
        />
      </Field>

      <Field
        label="Favicon"
        hint="Browser tab icon. Recommended 32×32 PNG or .ico."
      >
        <LogoUpload
          value={form.faviconUrl ?? ""}
          onChange={(url) => set("faviconUrl", url)}
          hint="Click to upload (.ico, .png, .svg)"
          accept="image/*,.ico"
        />
      </Field>
      {/* Action row */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
        <button
          onClick={handleReset}
          disabled={resetting}
          className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
        >
          {resetting ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <RotateCcw size={13} />
          )}
          Reset to defaults
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-60"
        >
          {saving ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Check size={14} />
          )}
          Save branding
        </button>
      </div>
    </div>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function Header() {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-1">
        <Palette size={18} className="text-blue-600" />
        <h2 className="text-lg font-semibold text-gray-900">White Label</h2>
      </div>
      <p className="text-sm text-gray-500">
        Replace launchtic&apos;s appearance so your clients see your brand instead.
        Organization-wide — affects every workspace under this Organization.
      </p>
    </div>
  );
}

function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

// Logo upload — same UX as FunnelFormDrawer's FaviconUpload: drag-target
// preview tile + filename + remove button. Uploads to /api/media/upload
// (returns { data: { url } }), stores the public URL back into form state.
function LogoUpload({
  value, onChange, hint, accept = "image/*",
}: {
  value:    string;
  onChange: (url: string) => void;
  hint:     string;
  accept?:  string;
}) {
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiFetch("/api/media/upload", { method: "POST", body: fd }).then((r) => r.json());
      const url = res.data?.url ?? res.url;
      if (url) onChange(url);
    } finally {
      setUploading(false);
      e.target.value = ""; // reset so re-selecting the same file fires onChange
    }
  }

  return (
    <div className="flex items-center gap-3">
      <label
        className="relative w-14 h-14 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors overflow-hidden shrink-0 group bg-white"
      >
        <input
          type="file"
          accept={accept}
          className="sr-only"
          onChange={handleFile}
          disabled={uploading}
        />
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="w-full h-full object-contain p-1" />
        ) : uploading ? (
          <Loader2 size={16} className="text-blue-400 animate-spin" />
        ) : (
          <Plus size={16} className="text-gray-300 group-hover:text-blue-400 transition-colors" />
        )}
      </label>
      <div className="flex-1 min-w-0">
        {value ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onChange("")}
              className="shrink-0 p-1 text-gray-300 hover:text-red-500 transition-colors"
              title="Remove"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ) : (
          <p className="text-xs text-gray-400">{hint}</p>
        )}
      </div>
    </div>
  );
}
