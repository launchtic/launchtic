"use client";

import { useState } from "react";
import { Monitor, Smartphone } from "lucide-react";

// Preview iframe with a Desktop / Mobile toggle. Mobile constrains the frame to
// 375px so MJML's responsive @media kicks in (columns stack, fluid images).
// The iframe is keyed by version+device so it remounts on toggle — browsers
// don't reliably reflow srcDoc when only width changes.
export default function EmailPreviewFrame({
  html, version = 0, title = "Email preview", minHeight = "400px",
}: {
  html: string;
  version?: number;
  title?: string;
  minHeight?: string;
}) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const mobile = device === "mobile";
  const btn = (active: boolean) =>
    `inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
      active ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
    }`;

  return (
    <div>
      <div className="flex items-center justify-end px-3 py-2 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
          <button type="button" onClick={() => setDevice("desktop")} className={btn(!mobile)} title="Desktop">
            <Monitor size={14} />
          </button>
          <button type="button" onClick={() => setDevice("mobile")} className={btn(mobile)} title="Mobile (375px)">
            <Smartphone size={14} />
          </button>
        </div>
      </div>
      {/* Always centered on a neutral backdrop so the frame reads like a real
          email: 600px on desktop (standard email width), 375px on mobile.
          maxWidth:100% keeps it from overflowing narrow screens. */}
      <div className="flex justify-center bg-gray-100 py-4">
        <iframe
          key={`${version}-${device}`}
          title={title}
          srcDoc={html}
          sandbox=""
          className="bg-white shadow-sm"
          style={{
            width: mobile ? 375 : 600,
            maxWidth: "100%",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            minHeight,
          }}
        />
      </div>
    </div>
  );
}
