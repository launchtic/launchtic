"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Save, Send, Loader2, Check, AlertCircle,
  Pencil, Eye, Lock, Trash2,
} from "lucide-react";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { STANDARD_VARIABLES } from "@launchtic/email";
import { useConfirm } from "../ui/ConfirmDialog";
import RichEmailEditor from "./RichEmailEditor";
import { apiFetch } from "../../lib/api-client";

type Category = "TRANSACTIONAL" | "MARKETING" | "SYSTEM";

type Initial = {
  id: string;
  name: string;
  subject: string;
  htmlBody: string;
  category: Category;
  isSystem: boolean;
  systemKey: string | null;
};

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; message: string };

type TestState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "ok" }
  | { status: "fail"; message: string };

const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-300 transition-colors";

// Tiny client-side {{var}} substitution — keeps preview render fast and
// reflects unsaved changes immediately.
function renderTokens(template: string, vars: Record<string, any>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path: string) => {
    const value = path.split(".").reduce<unknown>(
      (acc, key) => (acc != null && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined),
      vars,
    );
    return value == null ? "" : String(value);
  });
}

export default function TemplateEditor({ initial }: { initial: Initial }) {
  const router = useRouter();
  const params = useParams();
  const slug = params.workspaceSlug as string;
  const confirm = useConfirm();

  const [name, setName] = useState(initial.name);
  const [subject, setSubject] = useState(initial.subject);
  const [htmlBody, setHtmlBody] = useState(initial.htmlBody);
  const [category, setCategory] = useState<Category>(initial.category);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const [test, setTest] = useState<TestState>({ status: "idle" });
  const [testTo, setTestTo] = useState("");
  const [testOpen, setTestOpen] = useState(false);

  const subjectRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<TiptapEditor | null>(null);
  const lastFocused = useRef<"subject" | "body">("body");
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewSubject, setPreviewSubject] = useState<string>("");
  // Forces iframe remount on each preview render — browsers don't reliably
  // reload <iframe srcDoc> when the prop string changes, especially across
  // similar-length HTML. Bumping a key on every successful render guarantees
  // the iframe is rebuilt fresh.
  const [previewVersion, setPreviewVersion] = useState(0);

  const dirty = useMemo(
    () =>
      name !== initial.name ||
      subject !== initial.subject ||
      htmlBody !== initial.htmlBody ||
      category !== initial.category,
    [name, subject, htmlBody, category, initial],
  );

  // Warn user before leaving with unsaved changes
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const handleSave = useCallback(async () => {
    setSave({ status: "saving" });
    const body: Record<string, unknown> = { name, subject, htmlBody };
    if (!initial.isSystem) body.category = category;

    const res = await apiFetch(`/api/email-templates/${initial.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.success) {
      setSave({ status: "error", message: json.error ?? "Failed to save" });
      return;
    }
    setSave({ status: "saved" });
    setTimeout(() => setSave({ status: "idle" }), 2000);
    router.refresh();
  }, [name, subject, htmlBody, category, initial.id, initial.isSystem, router]);

  // Belt-and-suspenders: pull the editor's current JSON directly when
  // switching to Preview. The synchronous handleUpdate in RichEmailEditor
  // means parent state should already be in sync, but reading from the
  // editor instance bypasses any potential closure staleness.
  function flushEditorState() {
    const ed = editorRef.current;
    if (!ed) return;
    setHtmlBody(JSON.stringify(ed.getJSON()));
  }

  // Cmd+S / Ctrl+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty && save.status !== "saving") handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dirty, save.status, handleSave]);

  // Client-side preview render — picks up unsaved changes immediately. For
  // maily JSON content, dynamically imports @maily-to/render to convert to
  // email HTML, then substitutes {{vars}} with sample data.
  useEffect(() => {
    if (view !== "preview") return;
    let cancelled = false;
    (async () => {
      const sample = {
        contact: { firstName: "John", lastName: "Doe", email: "john@example.com", fullName: "John Doe" },
        workspace: { name: "Your Workspace" },
        order: { id: "ord_demo123", total: "$99.00", currency: "USD" },
        unsubscribeUrl: "#preview-unsubscribe",
      };
      const renderedSubject = renderTokens(subject, sample);
      const trimmed = (htmlBody ?? "").trim();
      let bodyHtml = "";
      if (trimmed.startsWith("{")) {
        try {
          const json = JSON.parse(trimmed);
          const { renderPreviewHtml } = await import("./preview-render");
          bodyHtml = await renderPreviewHtml(json);
        } catch (e) {
          bodyHtml = `<pre style="color:#dc2626;padding:16px;font-family:monospace;font-size:12px">Preview render failed: ${
            e instanceof Error ? e.message : "unknown"
          }</pre>`;
        }
      } else {
        bodyHtml = trimmed.startsWith("<") ? trimmed : `<p>${trimmed}</p>`;
      }
      const renderedBody = renderTokens(bodyHtml, sample);
      if (!cancelled) {
        setPreviewSubject(renderedSubject);
        setPreviewHtml(renderedBody);
        setPreviewVersion((v) => v + 1);
      }
    })();
    return () => { cancelled = true; };
  }, [view, htmlBody, subject]);

  function insertVariable(key: string) {
    const token = `{{${key}}}`;
    if (lastFocused.current === "subject") {
      const el = subjectRef.current;
      if (!el) return;
      const start = el.selectionStart ?? subject.length;
      const end = el.selectionEnd ?? subject.length;
      setSubject(subject.slice(0, start) + token + subject.slice(end));
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + token.length;
        el.setSelectionRange(pos, pos);
      });
    } else {
      const editor = editorRef.current;
      if (!editor) return;
      editor.chain().focus().insertContent(token).run();
    }
  }

  async function handleTestSend() {
    if (!testTo) return;
    setTest({ status: "sending" });
    // Save first if dirty so test reflects current content
    if (dirty) await handleSave();

    const res = await apiFetch(`/api/email-templates/${initial.id}/test-send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sendTo: testTo }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      setTest({ status: "fail", message: json.error ?? "Failed to send" });
      return;
    }
    setTest({ status: "ok" });
    setTimeout(() => setTest({ status: "idle" }), 3000);
  }

  async function handleDelete() {
    if (initial.isSystem) return;
    const ok = await confirm({
      title: "Delete template?",
      description: `"${initial.name}" will be permanently removed.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;

    const res = await apiFetch(`/api/email-templates/${initial.id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.success) router.push(`/${slug}/emails/templates`);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-gray-200 bg-white shrink-0">
        <Link
          href={`/${slug}/emails/templates`}
          className="p-1.5 -ml-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          {initial.isSystem && <Lock size={13} className="text-gray-400 shrink-0" />}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Template name"
            title="Click to rename template"
            className="text-sm font-medium text-gray-900 bg-transparent border border-transparent hover:border-gray-200 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:outline-none rounded-lg px-2 py-1 -mx-2 -my-1 w-full max-w-md transition-all"
          />
        </div>

        {/* View toggle */}
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
            onClick={() => { flushEditorState(); setView("preview"); }}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              view === "preview" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Eye size={12} /> Preview
          </button>
        </div>

        <button
          onClick={() => setTestOpen((o) => !o)}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50 rounded-lg transition-colors"
        >
          <Send size={12} /> Test send
        </button>

        <button
          onClick={handleSave}
          disabled={!dirty || save.status === "saving"}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg transition-colors"
        >
          {save.status === "saving"
            ? <Loader2 size={12} className="animate-spin" />
            : save.status === "saved"
              ? <Check size={12} />
              : <Save size={12} />}
          {save.status === "saved" ? "Saved" : "Save"}
        </button>

        {!initial.isSystem && (
          <button
            onClick={handleDelete}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* Test send drawer */}
      {testOpen && (
        <div className="border-b border-gray-200 bg-amber-50/50 px-4 sm:px-6 py-3 shrink-0">
          <div className="flex items-center gap-2 max-w-3xl">
            <span className="text-xs font-medium text-gray-700 whitespace-nowrap">Send test to:</span>
            <input
              type="email"
              value={testTo}
              onChange={(e) => { setTestTo(e.target.value); setTest({ status: "idle" }); }}
              placeholder="your@email.com"
              className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleTestSend}
              disabled={!testTo || test.status === "sending"}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg transition-colors"
            >
              {test.status === "sending" ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              Send
            </button>
            {test.status === "ok" && <span className="text-xs text-green-700 flex items-center gap-1"><Check size={12} /> Sent</span>}
            {test.status === "fail" && <span className="text-xs text-red-700 flex items-center gap-1 truncate"><AlertCircle size={12} /> {test.message}</span>}
          </div>
        </div>
      )}

      {/* Save error */}
      {save.status === "error" && (
        <div className="px-4 sm:px-6 py-2 bg-red-50 border-b border-red-200 text-sm text-red-700 flex items-center gap-2 shrink-0">
          <AlertCircle size={14} /> {save.message}
        </div>
      )}

      {/* Compact field strip — Subject + Category in single row (edit mode only) */}
      {view === "edit" && (
        <div className="border-b border-gray-100 bg-white shrink-0">
          <div className="max-w-3xl mx-auto px-4 sm:px-5 py-3 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 items-end">
            <div>
              <label className="block text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-1">Subject</label>
              <input
                ref={subjectRef}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                onFocus={() => { lastFocused.current = "subject"; }}
                placeholder="Email subject line"
                className={inputCls}
              />
            </div>
            {!initial.isSystem && (
              <div className="lg:w-44">
                <label className="block text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as Category)}
                  className={inputCls}
                >
                  <option value="MARKETING">Marketing</option>
                  <option value="TRANSACTIONAL">Transactional</option>
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 min-h-0 flex flex-col bg-white">
        {view === "edit" ? (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="max-w-3xl mx-auto px-4 sm:px-5 py-6 h-full flex flex-col">
                <div className="flex-1 min-h-0">
                  <RichEmailEditor
                    value={htmlBody}
                    onChange={setHtmlBody}
                    onEditorReady={(ed) => { editorRef.current = ed; }}
                    onFocus={() => { lastFocused.current = "body"; }}
                  />
                </div>
              </div>
            </div>

            {/* Variables row — fixed bottom */}
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
          // Preview view
          <div className="flex-1 min-h-0 overflow-y-auto bg-gray-100">
            <div className="max-w-3xl mx-auto px-4 sm:px-5 py-6">
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                  <p className="text-[11px] uppercase tracking-wider text-gray-400 mb-0.5">Subject</p>
                  <p className="text-sm font-medium text-gray-900">{previewSubject || subject || "(no subject)"}</p>
                </div>
                {previewHtml ? (
                  <iframe
                    key={previewVersion}
                    title="Email preview"
                    srcDoc={previewHtml}
                    sandbox=""
                    className="w-full p-2 bg-white"
                    style={{ minHeight: "calc(100vh - 280px)" }}
                  />
                ) : (
                  <div className="flex items-center justify-center py-20 text-gray-400 text-sm gap-2">
                    <Loader2 size={14} className="animate-spin" /> Rendering preview…
                  </div>
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
