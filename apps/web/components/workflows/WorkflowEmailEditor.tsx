"use client";

// Fullscreen editor for a single WorkflowEmail (the maily.to surface).
// Mirrors BroadcastDetail's edit pane but strips out the broadcast-only
// surfaces (audience picker, schedule/send, preview/test send).
//
// Two modes:
//   • "edit"   — initial email loaded from DB. Save → PATCH the existing row.
//   • "create" — initial=null (route /emails/new). Save → POST a new row,
//                then redirect to /emails/<newId>/edit so refresh / back
//                buttons land somewhere coherent.
//
// Explicitly NO autosave. The operator picks a sender, fills subject + body,
// validation runs on Save click. Until Save succeeds, the create-mode row
// does not exist in the database — no orphan rows from abandoned drafts.

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Save, AlertCircle } from "lucide-react";
import RichEmailEditor from "../emails/RichEmailEditor";
import { apiFetch } from "../../lib/api-client";
import { STANDARD_VARIABLES } from "@launchtic/email";
import { useToast } from "../ui/Toast";
import { validateWorkflowEmail } from "../../lib/workflow-validation";
import type { Editor as TiptapEditor } from "@tiptap/core";

type Sender = { id: string; name: string; email: string; isDefault: boolean };

type TemplateMini = { id: string; name: string; category: string };

type EmailRow = {
  id:        string;
  subject:   string;
  bodyHtml:  string;
  fromName:  string;
  fromEmail: string;
  senderId:  string | null;
};

const EMPTY_DOC = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] });

const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-300 transition-colors";

export default function WorkflowEmailEditor({
  workspaceSlug, workflow, email: initial, senders, templates,
}: {
  workspaceSlug: string;
  workflow:      { id: string; name: string };
  /** Existing email when editing; null when creating a new one. */
  email:         EmailRow | null;
  senders:       Sender[];
  templates:     TemplateMini[];
}) {
  const router = useRouter();
  const toast  = useToast();

  // Seed sender for create-mode: default sender if available, else first.
  // The operator can still change it before Save. Edit-mode reads from row.
  const seedSender = useMemo(
    () => senders.find((s) => s.isDefault) ?? senders[0] ?? null,
    [senders],
  );

  const isCreate = initial === null;

  const [subject,   setSubject]   = useState(initial?.subject   ?? "");
  const [bodyHtml,  setBodyHtml]  = useState(initial?.bodyHtml  || EMPTY_DOC);
  const [senderId,  setSenderId]  = useState<string | null>(
    initial?.senderId ?? seedSender?.id ?? null,
  );
  const [fromName,  setFromName]  = useState(
    initial?.fromName  ?? seedSender?.name  ?? "",
  );
  const [fromEmail, setFromEmail] = useState(
    initial?.fromEmail ?? seedSender?.email ?? "",
  );

  const editorRef    = useRef<TiptapEditor | null>(null);
  const lastFocused  = useRef<"subject" | "body">("body");
  const subjectRef   = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  // Validation errors — keyed list. Empty = valid.
  const [errors, setErrors] = useState<string[]>([]);

  // Dirty tracking — used to enable Save in edit mode (Save is always
  // active in create mode since we want first-write to land).
  const dirty = useMemo(
    () => {
      if (isCreate) return true; // first save always allowed
      return subject   !== (initial?.subject   ?? "")
          || bodyHtml  !== (initial?.bodyHtml  ?? "")
          || senderId  !== (initial?.senderId  ?? null)
          || fromName  !== (initial?.fromName  ?? "")
          || fromEmail !== (initial?.fromEmail ?? "");
    },
    [isCreate, subject, bodyHtml, senderId, fromName, fromEmail, initial],
  );

  // Validation mirrors the server-side validateWorkflowEmail rule so the
  // Save attempt won't be rejected by the workflow activate endpoint.
  function runValidation(): string[] {
    return validateWorkflowEmail({
      id:        initial?.id ?? "new",
      subject,
      bodyHtml,
      fromName,
      fromEmail,
      senderId,
    });
  }

  async function onSave() {
    const issues = runValidation();
    setErrors(issues);
    if (issues.length > 0) {
      toast.error(issues[0]);
      return;
    }
    setBusy(true);
    try {
      const payload = { subject, bodyHtml, senderId, fromName, fromEmail };
      const url = isCreate
        ? `/api/workflows/${workflow.id}/emails`
        : `/api/workflows/${workflow.id}/emails/${initial!.id}`;
      const res = await apiFetch(url, {
        method: isCreate ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.success === false) {
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }
      toast.success(isCreate ? "Email created." : "Email saved.");
      if (isCreate) {
        // Replace the URL so back-button doesn't land on /emails/new.
        const newId = json?.data?.id;
        if (typeof newId === "string") {
          router.replace(`/${workspaceSlug}/workflows/${workflow.id}/emails/${newId}/edit`);
        } else {
          router.push(`/${workspaceSlug}/workflows/${workflow.id}/emails`);
        }
      } else {
        // Refresh server state so the next navigation shows the saved row.
        router.refresh();
      }
    } catch {
      toast.error("Save failed — retry in a moment.");
    } finally {
      setBusy(false);
    }
  }

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

  // Apply a template: fetches its full payload, seeds subject + bodyHtml.
  // The dropdown immediately resets to "— None —" so the template act reads
  // as a one-shot "load these defaults" rather than persistent state
  // (mirrors the BroadcastDetail pattern). Operator's local edits aren't
  // saved yet — they're just staged in component state — so this overwrite
  // is recoverable by Cancel-ing without Save.
  const [templateBusy, setTemplateBusy] = useState(false);
  async function applyTemplate(templateId: string) {
    if (!templateId) return;
    setTemplateBusy(true);
    try {
      const res = await apiFetch(`/api/email-templates/${templateId}`);
      const json = await res.json();
      if (!res.ok || !json?.success || !json?.data) {
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }
      setSubject(json.data.subject ?? "");
      setBodyHtml(json.data.htmlBody ?? EMPTY_DOC);
      toast.success("Template applied — review and Save when ready.");
    } catch {
      toast.error("Couldn't load template.");
    } finally {
      setTemplateBusy(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Top bar — back link + Save button. No autosave indicator since
          saves are explicit; busy state surfaces inside the Save button. */}
      <div className="border-b border-gray-200 bg-white px-4 py-2.5 flex items-center gap-3 shrink-0">
        <Link
          href={`/${workspaceSlug}/workflows/${workflow.id}`}
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 shrink-0"
        >
          <ArrowLeft size={14} />
          <span>{workflow.name}</span>
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-semibold text-gray-900 truncate flex-1 min-w-0">
          {isCreate
            ? <span className="italic text-gray-500 font-normal">New email</span>
            : subject.trim() || <span className="italic text-gray-400 font-normal">Untitled email</span>}
        </span>
        {dirty && !busy && (
          <span className="text-[11px] text-amber-600 shrink-0">Unsaved changes</span>
        )}
        <button
          onClick={onSave}
          disabled={busy || (!isCreate && !dirty)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          {isCreate ? "Create email" : "Save"}
        </button>
      </div>

      {/* Validation error banner — surfaces every issue at once so the
          operator doesn't fix one only to hit the next on the second save. */}
      {errors.length > 0 && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 flex items-start gap-2 shrink-0">
          <AlertCircle size={14} className="text-red-600 shrink-0 mt-0.5" />
          <ul className="text-[12px] text-red-700 space-y-0.5">
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {/* Body — left: form fields (sender, subject). Right (flex-1): editor. */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Compact field row above the editor. Three columns on wide
            screens: From | Subject (stretchy) | Template (optional, only
            when templates exist). Stacks on narrow screens. */}
        <div className={`bg-white border-b border-gray-200 px-4 sm:px-5 py-3 grid grid-cols-1 gap-3 shrink-0 ${
          templates.length > 0
            ? "lg:grid-cols-[200px_1fr_200px]"
            : "sm:grid-cols-[200px_1fr]"
        }`}>
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
          {templates.length > 0 && (
            <div>
              <label className="block text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-1">Template</label>
              <select
                defaultValue=""
                value=""
                disabled={templateBusy}
                onChange={(e) => {
                  const id = e.target.value;
                  // Reset to "" so the next pick re-fires (otherwise the
                  // operator would have to first switch back to "— None —").
                  e.target.value = "";
                  applyTemplate(id);
                }}
                className={inputCls}
                title="Start from a saved email template"
              >
                <option value="">— None —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Editor pane — scrollable, fills remaining height. Container has
            no overflow-hidden so maily's floating "+ / drag-handle" controls
            aren't clipped (see RichEmailEditor's wrapper comment).
            • pt-16 (64px): reserves vertical room above the first block so
              maily's floating element toolbar (the bubble that pops above
              an image/button when selected) isn't clipped by the
              sender/subject row when the block is at the top of the scroll
              viewport.
            • scroll-pt-16: same idea but for keyboard / programmatic
              scrollIntoView — leaves the same gap above the active block. */}
        <div className="flex-1 min-h-0 overflow-y-auto bg-white scroll-pt-16">
          <div className="max-w-3xl mx-auto px-4 sm:px-5 pt-16 pb-6 h-full flex flex-col">
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
