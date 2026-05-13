"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { X, Mail, AlertCircle, Pencil, Eye, Loader2 } from "lucide-react";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { STANDARD_VARIABLES, isEmptyEmailDoc } from "@launchtic/email";
import RichEmailEditor from "./RichEmailEditor";

const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-300 transition-colors";

export type ComposePatch = {
  subject?: string;
  htmlBody?: string;
  templateId?: string | null;
  fromEmail?: string | null;
  fromName?: string | null;
};

type Template = { id: string; name: string; subject: string; htmlBody: string };
export type SenderIdentity = { id: string; name: string; email: string; isDefault: boolean };

type Tab = "edit" | "preview";

// Sample data used when rendering the live preview. Mirrors the worker's
// substitution context so what user sees == what gets sent (modulo real
// contact data).
const PREVIEW_VARS = {
  contact: {
    firstName: "John",
    lastName: "Doe",
    email: "john@example.com",
    fullName: "John Doe",
  },
  workspace: { name: "Your Workspace" },
  order: { id: "ord_demo123", total: "$99.00", currency: "USD" },
  unsubscribeUrl: "#preview-unsubscribe",
};

function substituteVars(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path: string) => {
    const value = path.split(".").reduce<unknown>(
      (acc, k) => (acc != null && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined),
      vars,
    );
    return value == null ? "" : String(value);
  });
}

export default function EmailComposeDrawer({
  open, onClose, title, subtitle,
  subject, htmlBody, currentTemplateId,
  fromEmail, fromName,
  onChange,
  templates,
  senderIdentities,
  errors,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  subject: string;
  htmlBody: string;
  currentTemplateId?: string | null;
  fromEmail?: string | null;
  fromName?: string | null;
  onChange: (patch: ComposePatch) => void;
  templates: Template[];
  senderIdentities: SenderIdentity[];
  errors?: { subject?: string; body?: string };
}) {
  const params = useParams();
  const slug = params.workspaceSlug as string;
  const editorRef = useRef<TiptapEditor | null>(null);
  const lastFocused = useRef<"subject" | "body">("body");
  const subjectRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<Tab>("edit");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  // Forces iframe remount on each preview render — browsers don't reliably
  // reload <iframe srcDoc> when its prop changes.
  const [previewVersion, setPreviewVersion] = useState(0);

  // ESC closes
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  // Re-render preview whenever user switches to Preview tab. Done lazily so
  // we don't pay the render cost on every keystroke.
  const renderPreview = useCallback(async () => {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const trimmed = (htmlBody ?? "").trim();
      if (!trimmed.startsWith("{")) throw new Error("Email body must be a maily JSON doc");
      const json = JSON.parse(trimmed);
      // Dynamic import — keeps maily render out of the editor's hot path.
      const { renderPreviewHtml } = await import("./preview-render");
      const html = await renderPreviewHtml(json);
      setPreviewHtml(substituteVars(html, PREVIEW_VARS));
      setPreviewVersion((v) => v + 1);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "Preview render failed");
    } finally {
      setPreviewLoading(false);
    }
  }, [htmlBody]);

  useEffect(() => {
    if (!open || tab !== "preview") return;
    renderPreview();
  }, [open, tab, renderPreview]);

  function applyTemplate(tplId: string) {
    const tpl = templates.find((t) => t.id === tplId);
    if (!tpl) return;
    // Don't call editor.setContent directly — TipTap interprets a plain
    // string as HTML, but our htmlBody is a JSON string (maily doc). Just
    // propagate via onChange; RichEmailEditor's external-value useEffect
    // parses the JSON correctly and updates the editor.
    onChange({ subject: tpl.subject, htmlBody: tpl.htmlBody, templateId: tpl.id });
  }

  function insertVariable(key: string) {
    const token = `{{${key}}}`;
    if (lastFocused.current === "subject") {
      const el = subjectRef.current;
      if (!el) return;
      const v = subject ?? "";
      const start = el.selectionStart ?? v.length;
      const end = el.selectionEnd ?? v.length;
      onChange({ subject: v.slice(0, start) + token + v.slice(end) });
      requestAnimationFrame(() => {
        el.focus();
        const p = start + token.length;
        el.setSelectionRange(p, p);
      });
    } else {
      editorRef.current?.chain().focus().insertContent(token).run();
    }
  }

  if (!open) return null;

  const previewSubject = substituteVars(subject ?? "", PREVIEW_VARS);

  return (
    // Full-page overlay — replaces the previous drawer/modal. Behaves like a
    // dedicated sub-page of the dashboard: the user dives in to compose, then
    // closes back to the builder. Mirrors the maily.to playground UX.
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-gray-200 shrink-0">
        <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
          <Mail size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 truncate">{title}</h3>
          {subtitle && (
            <p className="text-xs text-gray-500 truncate">{subtitle}</p>
          )}
        </div>

        {/* Tabs */}
        <div className="hidden sm:flex items-center bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setTab("edit")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              tab === "edit"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Pencil size={12} /> Edit
          </button>
          <button
            onClick={() => {
              // Pull the editor's current JSON before switching to preview —
              // RichEmailEditor wraps onChange in useTransition for typing
              // perf, so the last keystroke may not have committed to parent
              // state yet. React 18 auto-batches both setState calls in this
              // event handler so they apply atomically before the preview
              // useEffect runs.
              const ed = editorRef.current;
              if (ed) {
                const str = JSON.stringify(ed.getJSON());
                if (str !== htmlBody) onChange({ htmlBody: str });
              }
              setTab("preview");
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              tab === "preview"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Eye size={12} /> Preview
          </button>
        </div>

        <button
          onClick={onClose}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          title="Close (ESC)"
        >
          <X size={14} /> Done
        </button>
      </div>

      {/* Compact field strip — Subject + From + Template inline (only in edit mode) */}
      {tab === "edit" && (
        <div className="border-b border-gray-100 bg-white shrink-0">
          <div className="px-4 sm:px-5 py-3 grid grid-cols-1 lg:grid-cols-[1fr_auto_auto] gap-3 items-end">
            <div>
              <label className="block text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-1">Subject</label>
              <input
                ref={subjectRef}
                value={subject}
                onChange={(e) => onChange({ subject: e.target.value })}
                onFocus={() => { lastFocused.current = "subject"; }}
                placeholder="Email subject line"
                className={errors?.subject ? `${inputCls} border-red-300` : inputCls}
              />
              {errors?.subject && (
                <p className="mt-1 text-xs flex items-center gap-1 text-red-600">
                  <AlertCircle size={10} /> {errors.subject}
                </p>
              )}
            </div>

            <div className="lg:w-56">
              <label className="block text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-1">From</label>
              {senderIdentities.length === 0 ? (
                <Link
                  href={`/${slug}/settings?tab=sender-identities`}
                  className="block text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5"
                >
                  <AlertCircle size={11} className="inline mr-1" />
                  Add identity
                </Link>
              ) : (
                <select
                  value={pickIdentityId(fromEmail, senderIdentities) ?? ""}
                  onChange={(e) => {
                    const id = senderIdentities.find((s) => s.id === e.target.value);
                    if (id) onChange({ fromEmail: id.email, fromName: id.name });
                  }}
                  className={inputCls}
                >
                  {!pickIdentityId(fromEmail, senderIdentities) && (
                    <option value="">— Select —</option>
                  )}
                  {senderIdentities.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} &lt;{s.email}&gt;
                    </option>
                  ))}
                </select>
              )}
            </div>

            {templates.length > 0 && (
              <div className="lg:w-52">
                <label className="block text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-1">Template</label>
                <select
                  value={currentTemplateId ?? ""}
                  onChange={(e) => { if (e.target.value) applyTemplate(e.target.value); }}
                  className={inputCls}
                >
                  <option value="">— None —</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 min-h-0 flex flex-col">
        {tab === "edit" ? (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto bg-white">
              <div className="max-w-3xl mx-auto px-4 sm:px-5 py-6 h-full flex flex-col">
                <div className="flex-1 min-h-0">
                  <RichEmailEditor
                    value={htmlBody}
                    onChange={(html) => onChange({ htmlBody: html })}
                    onEditorReady={(ed) => { editorRef.current = ed; }}
                    onFocus={() => { lastFocused.current = "body"; }}
                  />
                </div>
                {errors?.body && (
                  <p className="mt-2 text-xs flex items-center gap-1 text-red-600 shrink-0">
                    <AlertCircle size={10} /> {errors.body}
                  </p>
                )}
              </div>
            </div>

            {/* Variables row — fixed bottom of the page */}
            <div className="border-t border-gray-200 bg-white shrink-0">
              <div className="px-4 sm:px-5 py-2.5 flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-gray-500 mr-1">Insert variable:</span>
                {STANDARD_VARIABLES.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => insertVariable(v.key)}
                    className="text-[11px] font-mono px-2 py-1 bg-gray-50 hover:bg-blue-50 hover:text-blue-700 text-gray-600 rounded-md transition-colors border border-gray-200"
                  >
                    {`{{${v.key}}}`}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          // Preview tab
          <div className="flex-1 min-h-0 overflow-y-auto bg-gray-100">
            <div className="max-w-3xl mx-auto px-4 sm:px-5 py-6">
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                  <p className="text-[11px] uppercase tracking-wider text-gray-400 mb-0.5">Subject</p>
                  <p className="text-sm font-medium text-gray-900">{previewSubject || subject || "(no subject)"}</p>
                  {(fromName || fromEmail) && (
                    <p className="text-xs text-gray-500 mt-1.5">
                      From: <span className="font-medium">{fromName ?? ""}</span>
                      {fromEmail && <span className="text-gray-400"> &lt;{fromEmail}&gt;</span>}
                    </p>
                  )}
                </div>
                {previewLoading ? (
                  <div className="flex items-center justify-center py-20 text-gray-400 text-sm gap-2">
                    <Loader2 size={14} className="animate-spin" /> Rendering preview…
                  </div>
                ) : previewError ? (
                  <div className="p-6 text-sm text-red-700 bg-red-50">
                    <p className="font-semibold mb-1">Preview render failed</p>
                    <p className="text-xs break-words">{previewError}</p>
                  </div>
                ) : (
                  <iframe
                    key={previewVersion}
                    title="Email preview"
                    srcDoc={previewHtml ?? ""}
                    sandbox=""
                    className="w-full p-2 bg-white"
                    style={{ minHeight: "calc(100vh - 280px)" }}
                  />
                )}
              </div>
              <p className="text-xs text-gray-400 mt-3 text-center">
                Preview uses sample data. Real emails will render with each contact&apos;s actual values.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Compact preview button for inside a card. Shows subject + body summary +
// "Edit content" affordance. Errors visible inline.
export function EmailComposeButton({
  subject, htmlBody, onClick, errors,
}: {
  subject: string;
  htmlBody: string;
  onClick: () => void;
  errors?: { subject?: string; body?: string };
}) {
  const hasErr = !!(errors?.subject || errors?.body);
  const previewLine = isEmptyEmailDoc(htmlBody) ? "(no body)" : "(rich content — open to edit)";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-start gap-3 text-left px-3.5 py-3 rounded-xl border transition-colors ${
        hasErr
          ? "border-red-300 bg-red-50/40 hover:bg-red-50"
          : "border-gray-200 hover:border-blue-300 hover:bg-blue-50/30 bg-white"
      }`}
    >
      <Mail size={15} className={hasErr ? "text-red-500 mt-0.5 shrink-0" : "text-emerald-600 mt-0.5 shrink-0"} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {subject?.trim() || <span className="text-gray-400">(no subject)</span>}
        </p>
        <p className="text-xs text-gray-500 truncate mt-0.5">{previewLine}</p>
        {hasErr && (
          <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
            <AlertCircle size={10} />
            {[errors?.subject, errors?.body].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
      <span className="text-xs font-medium text-blue-600 shrink-0 self-center">Edit content →</span>
    </button>
  );
}

// Match the saved fromEmail snapshot back to an identity by email. If user
// edited the underlying identity later, the snapshot might not match anymore
// — falls back to the default identity (or null if none).
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
