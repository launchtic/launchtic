"use client";

import { useState } from "react";
import { Pencil, Eye, Loader2 } from "lucide-react";
import { WELCOME_EMAIL_DOC } from "@launchtic/email";
import { apiFetch } from "../../lib/api-client";
import EmailBuilder from "./EmailBuilder";
import EmailPreviewFrame from "../emails/EmailPreviewFrame";

// Isolated POC harness for the new Craft+MJML email editor. Not wired into
// templates/broadcasts yet — proves the build → MJML → responsive HTML flow.
export default function EmailLabClient() {
  const [value, setValue] = useState<string>(WELCOME_EMAIL_DOC);
  const [view, setView] = useState<"build" | "preview">("build");
  const [html, setHtml] = useState("");
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);

  async function preview() {
    setBusy(true);
    try {
      const res = await apiFetch("/api/email-preview", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: value }),
      });
      const d = await res.json();
      setHtml(d.success ? d.data.html : `<pre style="color:#dc2626;padding:16px">${d.error}</pre>`);
      setVersion((v) => v + 1);
      setView("preview");
    } finally { setBusy(false); }
  }

  const tab = (a: boolean) => `flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md ${a ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 bg-white shrink-0">
        <span className="text-sm font-semibold text-gray-900">Email Lab <span className="text-gray-400 font-normal">(Craft + MJML POC)</span></span>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 ml-2">
          <button onClick={() => setView("build")} className={tab(view === "build")}><Pencil size={12} /> Build</button>
          <button onClick={() => setView("preview")} className={tab(view === "preview")}><Eye size={12} /> Preview</button>
        </div>
        <div className="flex-1" />
        <button onClick={preview} disabled={busy} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />} Render
        </button>
      </div>

      <div className="flex-1 min-h-0 p-3">
        {view === "build" ? (
          <EmailBuilder value={value} onChange={setValue} />
        ) : html ? (
          <div className="max-w-3xl mx-auto rounded-xl border border-gray-200 overflow-hidden bg-white">
            <EmailPreviewFrame html={html} version={version} minHeight="60vh" />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-gray-400">Click “Render” to preview.</div>
        )}
      </div>
    </div>
  );
}
