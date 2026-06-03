"use client";

// Fullscreen editor for a single WorkflowEmail (the maily.to surface).
// Mirrors BroadcastDetail's edit pane but strips out the broadcast-only
// surfaces (audience picker, schedule/send, preview/test send). Workflow
// emails don't need any of that — they're sent by the workflow runner when a
// contact reaches the SEND_EMAIL step, with vars resolved per-recipient at
// send time. Autosaves on every change with a short debounce, same pattern
// as the workflow builder's autosave.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Check } from "lucide-react";
import RichEmailEditor from "../emails/RichEmailEditor";
import { apiFetch } from "../../lib/api-client";
import { STANDARD_VARIABLES } from "@launchtic/email";
import { useToast } from "../ui/Toast";
import type { Editor as TiptapEditor } from "@tiptap/core";

type Sender = { id: string; name: string; email: string; isDefault: boolean };

type EmailRow = {
  id:        string;
  subject:   string;
  bodyHtml:  string;
  fromName:  string;
  fromEmail: string;
  senderId:  string | null;
};

const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-300 transition-colors";

export default function WorkflowEmailEditor({
  workspaceSlug, workflow, email: initial, senders,
}: {
  workspaceSlug: string;
  workflow:      { id: string; name: string };
  email:         EmailRow;
  senders:       Sender[];
}) {
  const router = useRouter();
  const toast  = useToast();

  const [subject,   setSubject]   = useState(initial.subject);
  const [bodyHtml,  setBodyHtml]  = useState(initial.bodyHtml);
  const [senderId,  setSenderId]  = useState<string | null>(initial.senderId);
  const [fromName,  setFromName]  = useState(initial.fromName);
  const [fromEmail, setFromEmail] = useState(initial.fromEmail);

  const editorRef    = useRef<TiptapEditor | null>(null);
  const lastFocused  = useRef<"subject" | "body">("body");
  const subjectRef   = useRef<HTMLInputElement>(null);

  // Autosave: debounce 700ms after the last change, then PATCH the row. We
  // never block typing on the network; "Saved" indicator switches to a spin
  // while in-flight so the operator knows their work persists.
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useMemo(
    () => subject   !== initial.subject
       || bodyHtml  !== initial.bodyHtml
       || senderId  !== initial.senderId
       || fromName  !== initial.fromName
       || fromEmail !== initial.fromEmail,
    [subject, bodyHtml, senderId, fromName, fromEmail, initial],
  );

  useEffect(() => {
    if (!dirty) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaveState("saving");
      try {
        const res = await apiFetch(`/api/workflows/${workflow.id}/emails/${initial.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject, bodyHtml,
            senderId, fromName, fromEmail,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setSaveState("saved");
      } catch {
        setSaveState("error");
        toast.error("Save failed — retry in a moment.");
      }
    }, 700);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [dirty, subject, bodyHtml, senderId, fromName, fromEmail, workflow.id, initial.id, toast]);

  // Refocus the last-focused editable surface so cursor doesn't jump back to
  // subject after typing in body (or vice versa) when a re-render happens.
  // Variables button uses this so inserting a token keeps focus where it was.
  const insertVariable = useCallback((key: string) => {
    const token = `{{${key}}}`;
    if (lastFocused.current === "subject") {
      const el = subjectRef.current;
      if (!el) return;
      const start = el.selectionStart ?? subject.length;
      const end   = el.selectionEnd   ?? subject.length;
      const next  = subject.slice(0, start) + token + subject.slice(end);
      setSubject(next);
      queueMicrotask(() => {
        el.focus();
        const pos = start + token.length;
        try { el.setSelectionRange(pos, pos); } catch { /* IE-only fallback no-op */ }
      });
    } else {
      const ed = editorRef.current;
      if (!ed) return;
      ed.chain().focus().insertContent(token).run();
    }
  }, [subject]);

  // Picking a sender identity also seeds fromName/fromEmail with the
  // identity's defaults so the worker has the values it needs at send time
  // (the worker reads either senderId OR fromName+fromEmail).
  function onSenderChange(id: string) {
    setSenderId(id || null);
    const s = senders.find((x) => x.id === id);
    if (s) {
      setFromName(s.name);
      setFromEmail(s.email);
    }
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Top bar — back link + save indicator. Mirrors the workflow builder
          top bar shape but slimmer since this surface only has one job. */}
      <div className="border-b border-gray-200 bg-white px-4 py-2.5 flex items-center gap-3 shrink-0">
        <Link
          href={`/${workspaceSlug}/workflows/${workflow.id}`}
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 shrink-0"
        >
          <ArrowLeft size={14} />
          <span>{workflow.name}</span>
        </Link>
        <span className="text-gray-300">/</span>
        {/* Subject doubles as the email's title — keeps the top bar useful
            (you can see which email you're editing at a glance) without a
            separate "name" field. Live-bound so it follows the subject
            input below. */}
        <span className="text-sm font-semibold text-gray-900 truncate flex-1 min-w-0">
          {subject.trim() || <span className="italic text-gray-400 font-normal">Untitled email</span>}
        </span>
        <div className="text-[11px] text-gray-500 flex items-center gap-1.5 shrink-0">
          {saveState === "saving" && (<><Loader2 size={11} className="animate-spin" /> Saving…</>)}
          {saveState === "saved"  && (<><Check    size={11} className="text-green-600" /> Saved</>)}
          {saveState === "error"  && (<span className="text-red-600">Save failed</span>)}
        </div>
      </div>

      {/* Body — left: form fields (sender, subject). Right (flex-1): editor. */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Compact field row above the editor */}
        <div className="bg-white border-b border-gray-200 px-4 sm:px-5 py-3 grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0">
          <div>
            <label className="block text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-1">From</label>
            <select
              className={inputCls}
              value={senderId ?? ""}
              onChange={(e) => onSenderChange(e.target.value)}
            >
              <option value="">— pick sender —</option>
              {senders.map((s) => (
                <option key={s.id} value={s.id}>{s.name} &lt;{s.email}&gt;</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-1">Subject</label>
            <input
              ref={subjectRef}
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              onFocus={() => { lastFocused.current = "subject"; }}
              placeholder="Hi {{contact.firstName}}…"
              className={inputCls}
            />
          </div>
        </div>

        {/* Editor pane — scrollable, fills remaining height. Container has
            no overflow-hidden so maily's floating "+ / drag-handle" controls
            aren't clipped (see RichEmailEditor's wrapper comment). */}
        <div className="flex-1 min-h-0 overflow-y-auto bg-white">
          <div className="max-w-3xl mx-auto px-4 sm:px-5 py-6 h-full flex flex-col">
            <div className="flex-1 min-h-0">
              <RichEmailEditor
                value={bodyHtml}
                onChange={setBodyHtml}
                onEditorReady={(ed) => { editorRef.current = ed; }}
                onFocus={() => { lastFocused.current = "body"; }}
              />
            </div>
          </div>
        </div>

        {/* Variables row — bottom, sticky. Click a chip → token inserted at
            the cursor in whichever surface (subject / body) was last focused. */}
        <div className="border-t border-gray-200 bg-white shrink-0">
          <div className="px-4 sm:px-5 py-2.5 flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-gray-500 mr-1">Insert variable:</span>
            {STANDARD_VARIABLES.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => insertVariable(v.key)}
                className="text-[11px] font-mono px-2 py-1 bg-gray-50 hover:bg-blue-50 hover:text-blue-700 text-gray-600 rounded-md transition-colors border border-gray-200"
                title={`${v.label} — e.g. ${v.example}`}
              >
                {`{{${v.key}}}`}
              </button>
            ))}
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => router.push(`/${workspaceSlug}/workflows/${workflow.id}`)}
              className="text-xs font-semibold text-gray-700 px-3 py-1.5 hover:bg-gray-100 rounded-md"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
