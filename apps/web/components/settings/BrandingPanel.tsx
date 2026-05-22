"use client";

// White Label panel — Agency tier feature. Lets the Organization owner
// override launchtic's logo / name / colors so clients see the agency's
// brand instead. Page-level gate already enforces Owner; this panel
// renders an upsell when the org plan lacks `whiteLabel`.

import { useState } from "react";
import { Loader2, Check, Crown, Palette, RotateCcw, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiFetch } from "../../lib/api-client";
import { useToast } from "../ui/Toast";
import { useConfirm } from "../ui/ConfirmDialog";

type BrandingConfig = {
  brandName?:    string;
  logoUrl?:      string;
  logoLightUrl?: string;
  faviconUrl?:   string;
  primaryColor?: string;
};

const DEFAULT_COLOR = "#2563eb";

// Shared input style — mirrors PaymentPanel for consistency across Settings.
// Larger touch targets, rounded-xl, gray-200 border, gray-300 placeholder.
const INPUT_CLS =
  "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 bg-white " +
  "focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-300 transition-colors";

export default function BrandingPanel({
  initial,
  plan,
  whiteLabelEnabled,
}: {
  initial:           BrandingConfig;
  plan:              string;
  whiteLabelEnabled: boolean;
}) {
  const slug   = useParams().workspaceSlug as string;
  const toast  = useToast();
  const confirm = useConfirm();

  // Local form state — sent to PUT /api/branding on save.
  const [form, setForm] = useState<BrandingConfig>(initial);
  const [saving, setSaving]   = useState(false);
  const [resetting, setReset] = useState(false);

  const set = <K extends keyof BrandingConfig>(k: K, v: BrandingConfig[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function handleSave() {
    if (!whiteLabelEnabled) return;
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

  // ── Upsell view for plans that don't include white-label ─────────────
  if (!whiteLabelEnabled) {
    return (
      <div className="max-w-2xl">
        <Header />
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex gap-4">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
            <Crown size={18} className="text-amber-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-gray-900 mb-1">
              White Label is an Agency feature
            </h3>
            <p className="text-sm text-gray-600 mb-3">
              Your current plan is <strong>{plan}</strong>. Upgrade to <strong>Agency</strong> to
              replace the launchtic logo, brand name, and colors with your own — so clients see
              your brand, not ours.
            </p>
            <Link
              href={`/${slug}/settings/license`}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg"
            >
              View license &amp; upgrade
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Active editor (Agency / Custom plan) ─────────────────────────────
  return (
    <div className="max-w-2xl space-y-6">
      <Header />

      <Field label="Brand name" hint="Shown in the top nav, browser title, and login page.">
        <input
          type="text" maxLength={60}
          className={INPUT_CLS}
          placeholder="launchtic"
          value={form.brandName ?? ""}
          onChange={(e) => set("brandName", e.target.value)}
        />
      </Field>

      <Section
        title="Logos"
        description="Upload PNG / SVG (recommended). Light variant is used on dark backgrounds — leave blank to fall back to the primary logo."
      >
        <Field label="Primary logo" hint="Used on light backgrounds. Recommended 200×40 px.">
          <LogoUpload
            value={form.logoUrl ?? ""}
            onChange={(url) => set("logoUrl", url)}
            hint="Click to upload (.png, .svg)"
          />
        </Field>

        <Field label="Logo (light)" hint="Used on dark backgrounds — typically a white/inverted version of your logo.">
          <LogoUpload
            value={form.logoLightUrl ?? ""}
            onChange={(url) => set("logoLightUrl", url)}
            hint="Click to upload (.png, .svg)"
          />
        </Field>

        <Field label="Favicon" hint="Browser tab icon. Recommended 32×32 PNG or .ico.">
          <LogoUpload
            value={form.faviconUrl ?? ""}
            onChange={(url) => set("faviconUrl", url)}
            hint="Click to upload (.ico, .png, .svg)"
            accept="image/*,.ico"
          />
        </Field>
      </Section>

      <Section
        title="Theme color"
        description="Replaces the default blue accent (buttons, links, focus rings)."
      >
        <Field label="Primary color">
          <div className="flex items-center gap-2">
            <input
              type="color"
              className="w-12 h-10 border border-gray-200 rounded-xl cursor-pointer bg-white"
              value={form.primaryColor ?? DEFAULT_COLOR}
              onChange={(e) => set("primaryColor", e.target.value)}
            />
            <input
              type="text"
              className={`${INPUT_CLS} font-mono w-40`}
              placeholder={DEFAULT_COLOR}
              value={form.primaryColor ?? ""}
              onChange={(e) => set("primaryColor", e.target.value)}
            />
            <span className="text-xs text-gray-400">Hex format (#rrggbb)</span>
          </div>
        </Field>
      </Section>

      {/* Action row */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
        <button
          onClick={handleReset}
          disabled={resetting}
          className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
        >
          {resetting ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
          Reset to defaults
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-60"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
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

function Section({
  title, description, children,
}: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-xs text-gray-500 mb-3">{description}</p>
      <div className="space-y-4">{children}</div>
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
            <p className="text-xs text-gray-500 truncate font-mono">{value}</p>
            <button
              type="button"
              onClick={() => onChange("")}
              className="shrink-0 p-1 text-gray-300 hover:text-red-500 transition-colors"
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
