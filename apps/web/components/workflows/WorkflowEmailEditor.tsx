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
import { ArrowLeft, Loader2, Save, AlertCircle, Braces } from "lucide-react";
import EmailBuilder from "../email-builder/EmailBuilder";
import { apiFetch } from "../../lib/api-client";
import { STANDARD_VARIABLES, EMPTY_EMAIL_DOC } from "@launchtic/email";
import { useToast } from "../ui/Toast";
import { validateWorkflowEmail } from "../../lib/workflow-validation";

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

const EMPTY_DOC = EMPTY_EMAIL_DOC;

const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-300 transition-colors";

export default function WorkflowEmailEditor({
  workspaceSlug, workflow, email: initial, senders, templates,
}: {
  workspaceSlug: string;
  workflow:      { id: string; name: string; status: string };
  /** Existing email when editing; null when creating a new one. */
  email:         EmailRow | null;
  senders:       Sender[];
  templates:     TemplateMini[];
}) {
  // Klaviyo-style strict lock: an ACTIVE parent workflow makes its emails
  // read-only. The server PATCH already 409s; this disables UI affordances
  // so the operator sees the lock before clicking Save and getting an
  // error toast. Create flow (initial === null) is unreachable when the
  // parent is ACTIVE since the modal hides the "Create new email" CTA —
  // but we still respect isLocked here as defense-in-depth.
  const isLocked = workflow.status === "ACTIVE";
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

  const subjectRef   = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  // Validation errors — keyed list. Empty = valid.
  const [errors, setErrors] = useState<string[]>([]);
  const [varsOpen, setVarsOpen] = useState(false);

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
          router.replace(`/${workspaceSlug}/workflow-email-editor/${workflow.id}/${newId}`);
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
  // Subject-only variable insert (body variables live in the builder's panel).
  const insertVariable = useCallback((key: string) => {
    const token = `{{${key}}}`;
    const el = subjectRef.current;
    if (!el) { setSubject((s) => s + token); return; }
    const start = el.selectionStart ?? subject.length;
    const end   = el.selectionEnd   ?? subject.length;
    setSubject(subject.slice(0, start) + token + subject.slice(end));
    queueMicrotask(() => { el.focus(); const pos = start + token.length; try { el.setSelectionRange(pos, pos); } catch {} });
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
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Single action bar — back · from · subject · template · save · done */}
      <div className="border-b border-gray-200 bg-white px-3 sm:px-4 py-2.5 flex items-center gap-2 shrink-0">
        <Link
          href={`/${workspaceSlug}/workflows/${workflow.id}`}
          title={workflow.name}
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 shrink-0"
        >
          <ArrowLeft size={16} />
          <span className="hidden lg:inline max-w-[120px] truncate">{workflow.name}</span>
        </Link>

        <select
          value={senderId ?? ""}
          onChange={(e) => onSenderChange(e.target.value)}
          disabled={isLocked}
          title="From sender"
          className="shrink-0 w-36 hidden md:block border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">From…</option>
          {senders.map((s) => <option key={s.id} value={s.id}>{s.name} &lt;{s.email}&gt;</option>)}
        </select>

        <div className="relative flex-1 min-w-0">
          <input
            ref={subjectRef}
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={isLocked}
            placeholder="Subject — Hi {{contact.firstName}}…"
            className={`${inputCls} pr-9`}
          />
          <button
            type="button"
            onClick={() => setVarsOpen((o) => !o)}
            title="Insert variable into subject"
            className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
          >
            <Braces size={14} />
          </button>
          {varsOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setVarsOpen(false)} />
              <div className="absolute left-0 top-full mt-1 z-20 w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-1.5">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 px-1.5 py-1">Insert into subject</p>
                <div className="max-h-56 overflow-y-auto">
                  {STANDARD_VARIABLES.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => { insertVariable(v.key); setVarsOpen(false); }}
                      className="w-full flex items-center justify-between gap-2 px-1.5 py-1.5 text-left rounded-md hover:bg-blue-50 group"
                    >
                      <span className="text-xs text-gray-600 group-hover:text-blue-700 truncate">{v.label}</span>
                      <span className="text-[10px] font-mono text-gray-400 group-hover:text-blue-600 shrink-0">{`{{${v.key}}}`}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {templates.length > 0 && !isLocked && (
          <select
            value=""
            disabled={templateBusy}
            onChange={(e) => applyTemplate(e.target.value)}
            title="Start from a template"
            className="shrink-0 w-32 hidden lg:block border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Template…</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}

        {!isLocked && (
          <button
            onClick={onSave}
            disabled={busy || (!isCreate && !dirty)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 shrink-0"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            {isCreate ? "Create" : "Save"}
          </button>
        )}
        <button
          type="button"
          onClick={() => router.push(`/${workspaceSlug}/workflows/${workflow.id}`)}
          className="text-xs font-semibold text-gray-700 px-3 py-1.5 hover:bg-gray-100 rounded-lg shrink-0"
        >
          Done
        </button>
      </div>

      {/* Parent-workflow lock banner. Mirrors the workflow builder banner
          so the operator gets the same explanation across surfaces. */}
      {isLocked && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 flex items-center gap-2 shrink-0">
          <AlertCircle size={13} className="text-amber-600 shrink-0" />
          <p className="text-[12px] text-amber-800 flex-1">
            Parent workflow is active — emails are read-only. Open the workflow and click <strong>Pause</strong> to edit.
          </p>
        </div>
      )}

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

      {/* Body — left: form fields (sender, subject). Right (flex-1): editor.
          Wrapping fieldset disables every form control (selects, inputs,
          variable chips) at once when the workflow is ACTIVE. `contents`
          removes the fieldset's own box so flex layout below works
          unchanged. (RichEmailEditor's TipTap surface isn't a form
          control — its read-only state needs a separate path, but for MVP
          the lock banner is clear enough; operators won't expect typing
          into mly to persist when Save is hidden.) */}
      <fieldset disabled={isLocked} className="contents">
      <div className="flex-1 min-h-0 flex flex-col">
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
        <div className="flex-1 min-h-0 p-3 bg-white">
          <EmailBuilder value={bodyHtml} onChange={setBodyHtml} />
        </div>
      </div>
      </fieldset>
    </div>
  );
}
