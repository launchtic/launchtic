"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Save, Send, Loader2, Check, AlertCircle,
  Users, Clock, Tag as TagIcon, Pencil, ChevronDown, X, Ban, Braces,
} from "lucide-react";
import { STANDARD_VARIABLES } from "@launchtic/email";
import { useConfirm } from "../ui/ConfirmDialog";
import { useToast } from "../ui/Toast";
import { useUnsavedChanges } from "../../contexts/UnsavedChangesContext";
import EmailBuilder from "../email-builder/EmailBuilder";
import EmailPreviewFrame from "./EmailPreviewFrame";
import { apiFetch } from "../../lib/api-client";

type Status = "DRAFT" | "SCHEDULED" | "SENDING" | "SENT" | "FAILED" | "CANCELED";
type Target = "ALL_CONTACTS" | "TAG" | "SEGMENT";

type Initial = {
  id: string;
  name: string;
  subject: string;
  htmlBody: string;
  templateId: string | null;
  fromEmail: string;
  fromName: string;
  status: Status;
  scheduledAt: string | null;
  sentAt: string | null;
  targetType: Target;
  targetTagIds: string[];
  excludeUnsubscribed: boolean;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
};

type TagRow = { id: string; name: string; color: string | null; count: number };
type Template = { id: string; name: string; subject: string; htmlBody: string; category: string };
type SenderIdentity = { id: string; name: string; email: string; isDefault: boolean };
type Stats = { total: number; sent: number; failed: number; bounced: number; queued: number };

const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-300 transition-colors";

export default function BroadcastDetail({
  initial, tags, templates, senderIdentities = [],
}: {
  initial: Initial;
  tags: TagRow[];
  templates: Template[];
  senderIdentities?: SenderIdentity[];
}) {
  const router = useRouter();
  const params = useParams();
  const slug = params.workspaceSlug as string;
  const confirm = useConfirm();
  const toast = useToast();

  const isScheduled = initial.status === "SCHEDULED";
  const isEditable = initial.status === "DRAFT" || isScheduled;
  const isSent = initial.status === "SENT" || initial.status === "SENDING";

  const [name, setName] = useState(initial.name);
  const [subject, setSubject] = useState(initial.subject);
  const [htmlBody, setHtmlBody] = useState(initial.htmlBody);
  const [fromEmail, setFromEmail] = useState<string>(initial.fromEmail);
  const [fromName, setFromName] = useState<string>(initial.fromName);
  const [targetType, setTargetType] = useState<Target>(initial.targetType);
  const [targetTagIds, setTargetTagIds] = useState<string[]>(initial.targetTagIds);
  const [excludeUnsubscribed, setExcludeUnsubscribed] = useState(initial.excludeUnsubscribed);
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">(
    initial.scheduledAt ? "later" : "now",
  );
  const [scheduleAt, setScheduleAt] = useState<string>(
    initial.scheduledAt ? toLocalDateTimeInput(new Date(initial.scheduledAt)) : "",
  ); // yyyy-MM-ddTHH:mm
  const [audience, setAudience] = useState<number | null>(null);

  const [view, setView] = useState<"edit" | "send">("edit");

  const [save, setSave] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [retrying, setRetrying] = useState(false);

  const subjectRef = useRef<HTMLInputElement>(null);
  const [varsOpen, setVarsOpen] = useState(false);

  const dirty = useMemo(
    () =>
      isEditable &&
      (name !== initial.name ||
        subject !== initial.subject ||
        htmlBody !== initial.htmlBody ||
        fromEmail !== initial.fromEmail ||
        fromName !== initial.fromName ||
        targetType !== initial.targetType ||
        JSON.stringify(targetTagIds) !== JSON.stringify(initial.targetTagIds) ||
        excludeUnsubscribed !== initial.excludeUnsubscribed),
    [name, subject, htmlBody, fromEmail, fromName, targetType, targetTagIds, excludeUnsubscribed, initial, isEditable],
  );

  // Audience preview — debounced
  useEffect(() => {
    if (!isEditable && !isScheduled) return;
    const t = setTimeout(async () => {
      const res = await apiFetch("/api/broadcasts/audience", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetTagIds, excludeUnsubscribed }),
      });
      const json = await res.json();
      if (json.success) setAudience(json.data.count);
    }, 300);
    return () => clearTimeout(t);
  }, [targetType, targetTagIds, excludeUnsubscribed, isEditable, isScheduled]);

  // Live stats for SENDING/SENT broadcasts
  useEffect(() => {
    if (!isSent && initial.status !== "FAILED") return;
    let cancelled = false;
    async function fetchStats() {
      const res = await apiFetch(`/api/broadcasts/${initial.id}/stats`);
      const json = await res.json();
      if (!cancelled && json.success) setStats(json.data);
    }
    fetchStats();
    if (initial.status === "SENDING") {
      const interval = setInterval(fetchStats, 3000);
      return () => { cancelled = true; clearInterval(interval); };
    }
    return () => { cancelled = true; };
  }, [isSent, initial.status, initial.id]);

  const handleSave = useCallback(async () => {
    if (!isEditable) return;
    setSave("saving"); setSaveErr(null);
    const res = await apiFetch(`/api/broadcasts/${initial.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name, subject, htmlBody,
        fromEmail, fromName,
        targetType, targetTagIds, excludeUnsubscribed,
      }),
    });
    const json = await res.json();
    if (!json.success) {
      setSave("error");
      setSaveErr(json.error ?? "Failed to save");
      return;
    }
    setSave("saved");
    setTimeout(() => setSave("idle"), 2000);
    router.refresh();
  }, [isEditable, initial.id, name, subject, htmlBody, fromEmail, fromName, targetType, targetTagIds, excludeUnsubscribed, router]);

  // Cmd+S
  useEffect(() => {
    if (!isEditable) return;
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty && save !== "saving") handleSave();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [isEditable, dirty, save, handleSave]);

  // Register dirty state with the global unsaved-changes guard. Covers
  // browser reload/close + every in-app <Link> click (TopNav, back arrow, etc.).
  useUnsavedChanges(dirty);

  // Subject-only variable insert (body variables live in the builder's panel).
  function insertVariable(key: string) {
    const token = `{{${key}}}`;
    const el = subjectRef.current;
    if (!el) { setSubject(subject + token); return; }
    const start = el.selectionStart ?? subject.length;
    const end = el.selectionEnd ?? subject.length;
    setSubject(subject.slice(0, start) + token + subject.slice(end));
    requestAnimationFrame(() => { el.focus(); const p = start + token.length; el.setSelectionRange(p, p); });
  }

  function applyTemplate(templateId: string) {
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;
    // Fetch full template content. Don't call editor.setContent directly —
    // TipTap interprets a plain string as HTML, but our htmlBody is a JSON
    // string (maily doc), so it would render as raw text. Just update parent
    // state; RichEmailEditor's external-value useEffect parses the JSON via
    // parseValue() and sets the editor content correctly.
    apiFetch(`/api/email-templates/${templateId}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.success) return;
        setSubject(json.data.subject);
        setHtmlBody(json.data.htmlBody);
      });
  }

  async function handleSend() {
    if (!isEditable && !isScheduled) return;
    if (audience === 0) {
      toast.warning("No recipients match your targeting.");
      return;
    }

    let scheduledAt: string | undefined;
    if (scheduleMode === "later") {
      if (!scheduleAt) { toast.warning("Pick a date and time first."); return; }
      const when = new Date(scheduleAt);
      // Mirror the server-side guard so users get instant feedback instead of
      // a 400 after click. 10-minute lead time matches the API.
      if (when.getTime() - Date.now() < 10 * 60_000) {
        toast.warning("Schedule time must be at least 10 minutes in the future.");
        return;
      }
      scheduledAt = when.toISOString();
    }

    const ok = await confirm({
      title: scheduleMode === "now" ? "Send now?" : "Schedule send?",
      description:
        scheduleMode === "now"
          ? `${audience ?? "?"} contacts will receive this email immediately.`
          : `${audience ?? "?"} contacts will receive this on ${new Date(scheduleAt).toLocaleString()}.`,
      confirmLabel: scheduleMode === "now" ? "Send now" : "Schedule",
      variant: "default",
    });
    if (!ok) return;

    setSending(true);
    // Save first to ensure latest content is in DB
    if (dirty) await handleSave();

    const res = await apiFetch(`/api/broadcasts/${initial.id}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scheduledAt ? { scheduledAt } : {}),
    });
    const json = await res.json();
    setSending(false);
    if (!json.success) { toast.error(json.error ?? "Failed to send"); return; }
    router.push(`/${slug}/emails/broadcasts`);
    router.refresh();
  }

  async function handleCancel() {
    const ok = await confirm({
      title: "Cancel scheduled broadcast?",
      description: "It will not be sent. You can edit and reschedule afterward.",
      confirmLabel: "Cancel send",
      variant: "warning",
    });
    if (!ok) return;
    const res = await apiFetch(`/api/broadcasts/${initial.id}/cancel`, { method: "POST" });
    const json = await res.json();
    if (!json.success) { toast.error(json.error ?? "Failed to cancel"); return; }
    toast.success("Schedule canceled — back to draft");
    router.refresh();
  }

  async function handleRetryFailed() {
    const failedNow = stats?.failed ?? initial.failedCount;
    if (failedNow <= 0) return;
    const ok = await confirm({
      title: "Retry failed emails?",
      description: `${failedNow} failed email(s) will be re-queued and sent again.`,
      confirmLabel: "Retry",
      variant: "default",
    });
    if (!ok) return;

    setRetrying(true);
    const res = await apiFetch(`/api/broadcasts/${initial.id}/retry-failed`, { method: "POST" });
    const json = await res.json();
    setRetrying(false);
    if (!json.success) { toast.error(json.error ?? "Retry failed"); return; }

    // Poll stats until queue drains (capped at 5 minutes)
    const start = Date.now();
    const interval = setInterval(async () => {
      const r = await apiFetch(`/api/broadcasts/${initial.id}/stats`);
      const j = await r.json();
      if (j.success) {
        setStats(j.data);
        if ((j.data.queued ?? 0) === 0) clearInterval(interval);
      }
      if (Date.now() - start > 5 * 60 * 1000) clearInterval(interval);
    }, 2000);
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Single action bar — back · name · status · subject · from · template · tabs · actions */}
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-gray-200 bg-white shrink-0">
        <Link
          href={`/${slug}/emails/broadcasts`}
          className="p-1.5 -ml-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
        >
          <ArrowLeft size={18} />
        </Link>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!isEditable}
          placeholder="Broadcast name"
          title="Click to rename"
          className="shrink-0 w-28 sm:w-40 text-sm font-medium text-gray-900 bg-transparent border border-transparent hover:border-gray-200 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:outline-none rounded-lg px-2 py-1.5 transition-all disabled:opacity-100 disabled:hover:border-transparent"
        />
        <StatusBadge status={initial.status} />

        {view === "edit" && (isEditable || isScheduled) ? (
          <>
            <div className="relative flex-1 min-w-0">
              <input
                ref={subjectRef}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={!isEditable}
                placeholder="Email subject line"
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
            {senderIdentities.length === 0 ? (
              <Link href={`/${slug}/settings/email`} className="shrink-0 hidden md:block text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                <AlertCircle size={11} className="inline mr-1" /> Add identity
              </Link>
            ) : (
              <select
                value={pickIdentityId(fromEmail, senderIdentities) ?? ""}
                onChange={(e) => { const id = senderIdentities.find((s) => s.id === e.target.value); if (id) { setFromEmail(id.email); setFromName(id.name); } }}
                disabled={!isEditable}
                title="From"
                className="shrink-0 w-36 hidden md:block border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {!pickIdentityId(fromEmail, senderIdentities) && <option value="">From…</option>}
                {senderIdentities.map((s) => <option key={s.id} value={s.id}>{s.name} &lt;{s.email}&gt;</option>)}
              </select>
            )}
            {templates.length > 0 && isEditable && (
              <select
                value=""
                onChange={(e) => { if (e.target.value) applyTemplate(e.target.value); }}
                title="Start from a template"
                className="shrink-0 w-32 hidden lg:block border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Template…</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
          </>
        ) : (
          <div className="flex-1" />
        )}

        {(isEditable || isScheduled) && (
          <div className="hidden sm:flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setView("edit")}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                view === "edit" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Pencil size={12} /> Edit
            </button>
            <button
              onClick={() => setView("send")}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                view === "send" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Send size={12} /> Send
            </button>
          </div>
        )}

        {isEditable && (
          <button
            onClick={handleSave}
            disabled={!dirty || save === "saving"}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg transition-colors"
          >
            {save === "saving" ? <Loader2 size={12} className="animate-spin" />
              : save === "saved" ? <Check size={12} /> : <Save size={12} />}
            {save === "saved" ? "Saved" : "Save"}
          </button>
        )}

        {isScheduled && (
          <button
            onClick={handleCancel}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors"
          >
            <Ban size={12} /> Cancel send
          </button>
        )}
      </div>

      {/* Save error */}
      {saveErr && (
        <div className="px-4 sm:px-6 py-2 bg-red-50 border-b border-red-200 text-sm text-red-700 flex items-center gap-2 shrink-0">
          <AlertCircle size={14} /> {saveErr}
        </div>
      )}

      {/* SENT/FAILED/CANCELED status → stats view (no tabs) */}
      {(isSent || initial.status === "FAILED" || initial.status === "CANCELED") && (
        <div className="flex-1 overflow-y-auto bg-gray-50">
          <SentDetail initial={initial} stats={stats} retrying={retrying} onRetryFailed={handleRetryFailed} />
        </div>
      )}

      {/* DRAFT/SCHEDULED → Edit / Preview / Send tabs */}
      {(isEditable || isScheduled) && (
        <>
          {/* Body */}
          <div className="flex-1 min-h-0 flex flex-col bg-white">
            {view === "edit" ? (
              <div className="flex-1 min-h-0 p-3">
                <EmailBuilder value={htmlBody} onChange={setHtmlBody} />
              </div>
            ) : (
              // Send tab — audience + schedule + send button
              <div className="flex-1 min-h-0 overflow-y-auto bg-gray-50">
                <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-5">
                  {/* Audience */}
                  <Section title="Audience" icon={Users}>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1.5">Send to</label>
                        <select
                          value={targetType}
                          disabled={!isEditable}
                          onChange={(e) => setTargetType(e.target.value as Target)}
                          className={inputCls}
                        >
                          <option value="ALL_CONTACTS">All contacts</option>
                          <option value="TAG">Contacts with tag(s)</option>
                        </select>
                      </div>

                      {targetType === "TAG" && (
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1.5">Tags (any of)</label>
                          <TagPicker
                            tags={tags}
                            selected={targetTagIds}
                            onChange={setTargetTagIds}
                            disabled={!isEditable}
                          />
                        </div>
                      )}

                      <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={excludeUnsubscribed}
                          disabled={!isEditable}
                          onChange={(e) => setExcludeUnsubscribed(e.target.checked)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        Exclude unsubscribed and bounced contacts (recommended)
                      </label>

                      {audience !== null && (
                        <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-700 flex items-center gap-2">
                          <Users size={13} />
                          Will send to <strong>{audience.toLocaleString()}</strong> contact{audience !== 1 ? "s" : ""}
                        </div>
                      )}
                    </div>
                  </Section>

                  {/* Schedule */}
                  {isEditable && (
                    <Section title="Schedule" icon={Clock}>
                      <div className="space-y-3">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setScheduleMode("now")}
                            className={`flex-1 px-3 py-2 text-sm font-medium rounded-xl border transition-colors ${
                              scheduleMode === "now"
                                ? "border-blue-500 bg-blue-50 text-blue-700"
                                : "border-gray-200 text-gray-600 hover:bg-gray-50"
                            }`}
                          >
                            Send immediately
                          </button>
                          <button
                            type="button"
                            onClick={() => setScheduleMode("later")}
                            className={`flex-1 px-3 py-2 text-sm font-medium rounded-xl border transition-colors ${
                              scheduleMode === "later"
                                ? "border-blue-500 bg-blue-50 text-blue-700"
                                : "border-gray-200 text-gray-600 hover:bg-gray-50"
                            }`}
                          >
                            Schedule for later
                          </button>
                        </div>
                        {scheduleMode === "later" && (
                          <div>
                            <input
                              type="datetime-local"
                              value={scheduleAt}
                              onChange={(e) => setScheduleAt(e.target.value)}
                              min={toLocalDateTimeInput(new Date(Date.now() + 10 * 60_000))}
                              className={inputCls}
                            />
                            <p className="mt-1 text-xs text-gray-400">
                              Must be at least 10 minutes from now.
                            </p>
                          </div>
                        )}
                      </div>

                      <button
                        onClick={handleSend}
                        disabled={sending || (audience !== null && audience === 0)}
                        className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-xl transition-colors"
                      >
                        {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                        {scheduleMode === "now" ? "Send now" : "Schedule send"}
                      </button>
                    </Section>
                  )}

                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Match a saved fromEmail to an identity row by email (case-insensitive).
// Falls back to the workspace default identity, or the first identity, or null.
function pickIdentityId(
  fromEmail: string | null | undefined,
  identities: SenderIdentity[],
): string | null {
  if (fromEmail) {
    const hit = identities.find((s) => s.email.toLowerCase() === fromEmail.toLowerCase());
    if (hit) return hit.id;
  }
  return identities.find((s) => s.isDefault)?.id ?? identities[0]?.id ?? null;
}

// ─── Sent / Stats view ───────────────────────────────────────────────────────

function SentDetail({
  initial, stats, retrying, onRetryFailed,
}: {
  initial: Initial;
  stats: Stats | null;
  retrying: boolean;
  onRetryFailed: () => void;
}) {
  const total = stats?.total ?? initial.totalRecipients;
  const sent = stats?.sent ?? initial.sentCount;
  const failed = stats?.failed ?? initial.failedCount;
  const queued = stats?.queued ?? 0;
  const progress = total > 0 ? Math.round(((sent + failed) / total) * 100) : 0;
  const canRetry =
    failed > 0 &&
    queued === 0 &&
    (initial.status === "SENT" || initial.status === "FAILED");

  // Render the sent body. The DB field may hold maily JSON or legacy HTML
  // — branch on the first char and run @maily-to/render dynamically when
  // it's JSON.
  const [bodyHtml, setBodyHtml] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const trimmed = (initial.htmlBody ?? "").trim();
      if (trimmed.startsWith("{")) {
        try {
          const res = await apiFetch("/api/email-preview", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ body: trimmed }),
          });
          const d = await res.json();
          if (!cancelled) setBodyHtml(d.success ? d.data.html : `<pre style="color:#dc2626;padding:16px">${d.error ?? "Render failed"}</pre>`);
        } catch {
          if (!cancelled) setBodyHtml(`<pre style="padding:16px">Render failed</pre>`);
        }
      } else {
        if (!cancelled) setBodyHtml(trimmed.startsWith("<") ? trimmed : `<p>${trimmed}</p>`);
      }
    })();
    return () => { cancelled = true; };
  }, [initial.htmlBody]);

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">Delivery</h3>
          {canRetry && (
            <button
              onClick={onRetryFailed}
              disabled={retrying}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors"
            >
              {retrying ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              Retry {failed} failed
            </button>
          )}
        </div>

        {(initial.status === "SENDING" || queued > 0) && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
              <span>Progress</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Recipients" value={total} />
          <Stat label="Sent" value={sent} color="text-emerald-600" />
          <Stat label="Failed" value={failed} color={failed > 0 ? "text-red-600" : ""} />
          {queued > 0 && <Stat label="In queue" value={queued} color="text-blue-600" />}
        </div>

        {initial.sentAt && (
          <p className="text-xs text-gray-400 mt-4">
            Sent {new Date(initial.sentAt).toLocaleString()}
          </p>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Email content</h3>
        <p className="text-xs text-gray-400 mb-1">Subject</p>
        <p className="text-sm text-gray-900 mb-3">{initial.subject}</p>
        <p className="text-xs text-gray-400 mb-1">Body</p>
        {bodyHtml === null ? (
          <div className="flex items-center justify-center py-12 text-gray-400 text-sm gap-2 border border-gray-100 rounded-lg">
            <Loader2 size={14} className="animate-spin" /> Rendering…
          </div>
        ) : (
          <EmailPreviewFrame html={bodyHtml} title="Sent broadcast" minHeight="400px" />
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div>
      <p className={`text-2xl font-semibold ${color ?? "text-gray-900"}`}>{value.toLocaleString()}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

// ─── UI helpers ──────────────────────────────────────────────────────────────

function Section({ title, icon: Icon, children }: { title: string; icon?: any; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 mb-3">
        {Icon && <Icon size={14} className="text-gray-500" />}
        {title}
      </h3>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, string> = {
    DRAFT:     "bg-gray-100 text-gray-600",
    SCHEDULED: "bg-amber-50 text-amber-700",
    SENDING:   "bg-blue-50 text-blue-700",
    SENT:      "bg-emerald-50 text-emerald-700",
    FAILED:    "bg-red-50 text-red-700",
    CANCELED:  "bg-gray-100 text-gray-500",
  };
  return (
    <span className={`text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded ${map[status]} shrink-0`}>
      {status.toLowerCase()}
    </span>
  );
}

function TagPicker({
  tags, selected, onChange, disabled,
}: {
  tags: TagRow[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selectedTags = tags.filter((t) => selected.includes(t.id));

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={`${inputCls} text-left flex items-center justify-between gap-2 disabled:opacity-60`}
      >
        <div className="flex flex-wrap gap-1 flex-1 min-w-0">
          {selectedTags.length === 0 ? (
            <span className="text-gray-400">Select tags…</span>
          ) : (
            selectedTags.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded"
                style={{ background: (t.color ?? "#6366f1") + "20", color: t.color ?? "#6366f1" }}
              >
                <TagIcon size={10} /> {t.name}
                {!disabled && (
                  <X
                    size={10}
                    className="cursor-pointer hover:opacity-70"
                    onClick={(e) => {
                      e.stopPropagation();
                      onChange(selected.filter((id) => id !== t.id));
                    }}
                  />
                )}
              </span>
            ))
          )}
        </div>
        <ChevronDown size={14} className="text-gray-400 shrink-0" />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto z-10"
          onMouseLeave={() => setOpen(false)}
        >
          {tags.length === 0 ? (
            <div className="px-3 py-3 text-xs text-gray-400">No tags created yet.</div>
          ) : (
            tags.map((t) => {
              const checked = selected.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() =>
                    onChange(checked ? selected.filter((id) => id !== t.id) : [...selected, t.id])
                  }
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 text-left"
                >
                  <input type="checkbox" checked={checked} readOnly className="rounded border-gray-300" />
                  <span className="flex items-center gap-1.5 flex-1 min-w-0">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: t.color ?? "#6366f1" }}
                    />
                    <span className="truncate">{t.name}</span>
                  </span>
                  <span className="text-xs text-gray-400 shrink-0">{t.count}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// Format a Date for `<input type="datetime-local">` value. The input expects
// `YYYY-MM-DDTHH:mm` in the user's local timezone (NOT ISO/UTC), so we build
// it from local getters rather than `.toISOString()`.
function toLocalDateTimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
