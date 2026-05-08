import React, { useState, useEffect, useCallback } from "react";
import { Search, BarChart2, Type, Check, Loader2 } from "lucide-react";
import { useEditorContext } from "../../contexts/EditorContext";
import { FontTypeSettings } from "@launchtic/elements";

type SeoMeta = { title?: string; description?: string; ogImage?: string };
type TrackingMeta = {
  gaId?: string; fbPixelId?: string; gtmId?: string;
  tiktokPixelId?: string; headScript?: string; bodyScript?: string;
};
type FontMeta = {
  fontType?: string;
  fontFamily?: string;
  fontStyle?: string;
};

const inputCls =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white " +
  "focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-300";

const textareaCls =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono text-gray-800 bg-white " +
  "focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-300 resize-none";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      {children}
      {hint && <p className="mt-0.5 text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}

const TABS = [
  { id: "seo",      label: "SEO",      icon: Search    },
  { id: "style",    label: "Style",    icon: Type      },
  { id: "tracking", label: "Tracking", icon: BarChart2 },
] as const;

type Tab = typeof TABS[number]["id"];

export const StepSettingsPanel: React.FC = () => {
  const { meta, saveMeta, pageData } = useEditorContext();
  const [tab, setTab]         = useState<Tab>("seo");
  const [saving, setSaving]   = useState(false);
  const [saved,  setSaved]    = useState(false);

  // SEO
  const [seoTitle,  setSeoTitle]  = useState("");
  const [seoDesc,   setSeoDesc]   = useState("");
  const [ogImage,   setOgImage]   = useState("");

  // Tracking
  const [gaId,         setGaId]         = useState("");
  const [fbPixelId,    setFbPixelId]    = useState("");
  const [gtmId,        setGtmId]        = useState("");
  const [tiktokPixelId,setTiktokPixelId]= useState("");
  const [headScript,   setHeadScript]   = useState("");
  const [bodyScript,   setBodyScript]   = useState("");

  // Style — page-level default font (cascades to elements with fontType="default")
  const [fontType,    setFontType]    = useState<string>("default");
  const [fontFamily,  setFontFamily]  = useState<string | undefined>(undefined);
  const [fontStyle,   setFontStyle]   = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!meta) return;
    const seo      = (meta.seo      ?? {}) as SeoMeta;
    const tracking = (meta.tracking ?? {}) as TrackingMeta;
    const font     = (meta.font     ?? {}) as FontMeta;
    setSeoTitle (seo.title       ?? "");
    setSeoDesc  (seo.description ?? "");
    setOgImage  (seo.ogImage     ?? "");
    setGaId         (tracking.gaId          ?? "");
    setFbPixelId    (tracking.fbPixelId     ?? "");
    setGtmId        (tracking.gtmId         ?? "");
    setTiktokPixelId(tracking.tiktokPixelId ?? "");
    setHeadScript   (tracking.headScript    ?? "");
    setBodyScript   (tracking.bodyScript    ?? "");
    setFontType     (font.fontType    ?? "default");
    setFontFamily   (font.fontFamily  ?? undefined);
    setFontStyle    (font.fontStyle   ?? undefined);
  }, [meta]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    await saveMeta({
      seo: { title: seoTitle, description: seoDesc, ogImage },
      tracking: { gaId, fbPixelId, gtmId, tiktokPixelId, headScript, bodyScript },
      font: { fontType, fontFamily, fontStyle },
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [saveMeta, seoTitle, seoDesc, ogImage, gaId, fbPixelId, gtmId, tiktokPixelId, headScript, bodyScript, fontType, fontFamily, fontStyle]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #e5e7eb", padding: "0 8px" }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              display:      "flex",
              alignItems:   "center",
              gap:          "5px",
              padding:      "8px 12px",
              fontSize:     "12px",
              fontWeight:   tab === id ? 600 : 400,
              color:        tab === id ? "#2563eb" : "#6b7280",
              borderBottom: tab === id ? "2px solid #2563eb" : "2px solid transparent",
              background:   "none",
              border:       "none",
              borderBottomWidth: "2px",
              borderBottomStyle: "solid",
              borderBottomColor: tab === id ? "#2563eb" : "transparent",
              cursor:       "pointer",
              whiteSpace:   "nowrap",
            }}
          >
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
        {tab === "seo" && (
          <>
            <Field label="Page title" hint="Shown in browser tab and search results. ~60 chars.">
              <input
                value={seoTitle}
                onChange={(e) => setSeoTitle(e.target.value)}
                placeholder="My awesome page"
                className={inputCls}
                maxLength={80}
              />
              <p style={{ textAlign: "right", fontSize: 10, color: seoTitle.length > 60 ? "#ef4444" : "#9ca3af", marginTop: 2 }}>
                {seoTitle.length}/60
              </p>
            </Field>

            <Field label="Meta description" hint="Shown in search results. ~160 chars.">
              <textarea
                value={seoDesc}
                onChange={(e) => setSeoDesc(e.target.value)}
                placeholder="Describe what this page is about..."
                className={textareaCls}
                rows={3}
                maxLength={200}
              />
              <p style={{ textAlign: "right", fontSize: 10, color: seoDesc.length > 160 ? "#ef4444" : "#9ca3af", marginTop: 2 }}>
                {seoDesc.length}/160
              </p>
            </Field>

            <Field label="OG Image URL" hint="Social share preview image (1200×630px recommended).">
              <input
                value={ogImage}
                onChange={(e) => setOgImage(e.target.value)}
                placeholder="https://..."
                className={inputCls}
              />
            </Field>
          </>
        )}

        {tab === "style" && (
          <>
            <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 12, lineHeight: 1.4 }}>
              Default font for this page. Elements with font type set to{" "}
              <strong>"Same font as the page"</strong> will inherit this.
            </p>
            <FontTypeSettings
              fontType={fontType}
              setFontType={setFontType}
              fontFamily={fontFamily}
              setFontFamily={setFontFamily}
              fontStyle={fontStyle}
              setFontStyle={setFontStyle}
            />
          </>
        )}

        {tab === "tracking" && (
          <>
            <Field label="Google Analytics 4" hint="Format: G-XXXXXXXXXX">
              <input
                value={gaId}
                onChange={(e) => setGaId(e.target.value)}
                placeholder="G-XXXXXXXXXX"
                className={inputCls}
              />
            </Field>

            <Field label="Facebook Pixel ID" hint="15-digit number from Events Manager.">
              <input
                value={fbPixelId}
                onChange={(e) => setFbPixelId(e.target.value)}
                placeholder="123456789012345"
                className={inputCls}
              />
            </Field>

            <Field label="Google Tag Manager" hint="Format: GTM-XXXXXXX">
              <input
                value={gtmId}
                onChange={(e) => setGtmId(e.target.value)}
                placeholder="GTM-XXXXXXX"
                className={inputCls}
              />
            </Field>

            <Field label="TikTok Pixel ID">
              <input
                value={tiktokPixelId}
                onChange={(e) => setTiktokPixelId(e.target.value)}
                placeholder="CXXXXXXXXXXXXXXXXX"
                className={inputCls}
              />
            </Field>

            <Field label="Custom <head> script" hint="Injected inside <head> before </head>.">
              <textarea
                value={headScript}
                onChange={(e) => setHeadScript(e.target.value)}
                placeholder={"<script>\n  // your code\n</script>"}
                className={textareaCls}
                rows={4}
              />
            </Field>

            <Field label="Custom <body> script" hint="Injected at the end of <body>.">
              <textarea
                value={bodyScript}
                onChange={(e) => setBodyScript(e.target.value)}
                placeholder={"<script>\n  // your code\n</script>"}
                className={textareaCls}
                rows={4}
              />
            </Field>
          </>
        )}
      </div>

      {/* Save */}
      <div style={{ padding: "10px 12px", borderTop: "1px solid #e5e7eb" }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            display:      "flex",
            alignItems:   "center",
            gap:          "6px",
            width:        "100%",
            justifyContent: "center",
            padding:      "7px 0",
            fontSize:     "12px",
            fontWeight:   600,
            color:        "#fff",
            background:   saving ? "#93c5fd" : saved ? "#16a34a" : "#2563eb",
            border:       "none",
            borderRadius: "8px",
            cursor:       saving ? "not-allowed" : "pointer",
            transition:   "background 0.2s",
          }}
        >
          {saving ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : saved ? <Check size={13} /> : null}
          {saved ? "Saved!" : saving ? "Saving…" : "Save settings"}
        </button>
      </div>
    </div>
  );
};
