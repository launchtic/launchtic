"use client";

import { useEffect, useState } from "react";
import { MailCheck, Loader2, Info, RotateCcw } from "lucide-react";
import { useToast } from "../ui/Toast";

type Footer = {
  unsubscribeText: string | null;
  physicalAddress: string | null;
};

const DEFAULT_UNSUB_TEXT = "Don't want these emails? You can {unsubscribe} anytime.";

const inputCls =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white " +
  "focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400";

export default function EmailFooterPanel() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [unsubscribeText, setUnsubscribeText] = useState("");
  const [physicalAddress, setPhysicalAddress] = useState("");

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/email-footer");
      const json = await res.json();
      if (json.success) {
        setUnsubscribeText(json.data.unsubscribeText ?? "");
        setPhysicalAddress(json.data.physicalAddress ?? "");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/email-footer", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unsubscribeText: unsubscribeText.trim() || null,
          physicalAddress: physicalAddress.trim() || null,
        }),
      });
      const json = await res.json();
      if (json.success) toast.success("Email footer saved");
      else toast.error(json.error ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400">
        <Loader2 size={18} className="animate-spin" />
      </div>
    );
  }

  // Live preview helper — match the first single-brace token, use its inner
  // text as the link label. Mirror server logic in render.ts.
  const previewText = unsubscribeText.trim() || DEFAULT_UNSUB_TEXT;
  const previewMatch = previewText.match(/\{([^{}]+)\}/);
  const previewSafe = previewMatch ? previewText : DEFAULT_UNSUB_TEXT;
  const safeMatch = previewSafe.match(/\{([^{}]+)\}/)!;
  const linkLabel = safeMatch[1];
  const idx = safeMatch.index!;
  const unsubBefore = previewSafe.slice(0, idx);
  const unsubAfter = previewSafe.slice(idx + safeMatch[0].length);

  return (
    <section>
      <div className="flex items-center gap-2.5 mb-1">
        <MailCheck size={18} className="text-gray-700" />
        <h2 className="text-base font-semibold text-gray-900">Email Footer</h2>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Auto-appended to every broadcast, sequence, and automation email.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Form — left, wider */}
        <div className="lg:col-span-3 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Unsubscribe message
            </label>
            <div className="relative">
              <input
                type="text"
                value={unsubscribeText}
                onChange={(e) => setUnsubscribeText(e.target.value)}
                placeholder={DEFAULT_UNSUB_TEXT}
                maxLength={500}
                className={inputCls + " pr-9"}
              />
              {unsubscribeText && (
                <button
                  onClick={() => setUnsubscribeText("")}
                  title="Reset to default"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-700"
                >
                  <RotateCcw size={13} />
                </button>
              )}
            </div>
            <p className="mt-1 text-[11px] text-gray-500 flex items-start gap-1">
              <Info size={11} className="shrink-0 mt-0.5" />
              <span>
                Wrap any text in <code className="bg-gray-100 px-1 rounded font-mono text-[10px]">{"{ }"}</code> — that text becomes the clickable link. Works in any language: <code className="bg-gray-100 px-1 rounded font-mono text-[10px]">{"{unsubscribe}"}</code>.
              </span>
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
              Physical mailing address
              <span className="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                CAN-SPAM
              </span>
            </label>
            <textarea
              value={physicalAddress}
              onChange={(e) => setPhysicalAddress(e.target.value)}
              placeholder={`Acme Inc.\n123 Market St, Suite 400\nSan Francisco, CA 94105`}
              rows={3}
              maxLength={500}
              className={inputCls + " resize-none"}
            />
            <p className="mt-1 text-[11px] text-gray-500">
              Required by US CAN-SPAM Act for commercial emails. Improves deliverability across all regions.
            </p>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 inline-flex items-center gap-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />} Save
          </button>
        </div>

        {/* Preview — right, narrower, sticky on tall screens */}
        <div className="lg:col-span-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Preview</p>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center text-xs text-gray-600 space-y-2 lg:sticky lg:top-4">
            <p className="text-gray-300 italic">[Email content above]</p>
            <hr className="border-gray-200" />
            {physicalAddress.trim() && (
              <p className="whitespace-pre-line text-gray-500 text-[11px]">{physicalAddress}</p>
            )}
            <p>
              {unsubBefore}
              <span className="text-gray-700 underline font-semibold">{linkLabel}</span>
              {unsubAfter}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
