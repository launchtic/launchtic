"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Save, Send, Loader2, Check, AlertCircle,
  Lock, Trash2, Braces, X, Settings,
} from "lucide-react";
import { STANDARD_VARIABLES } from "@launchtic/email";
import { useConfirm } from "../ui/ConfirmDialog";
import EmailBuilder from "../email-builder/EmailBuilder";
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

export default function TemplateEditor({ initial }: { initial: Initial }) {
  const router = useRouter();
  const params = useParams();
  const slug = params.workspaceSlug as string;
  const confirm = useConfirm();

  const [name, setName] = useState(initial.name);
  const [subject, setSubject] = useState(initial.subject);
  const [htmlBody, setHtmlBody] = useState(initial.htmlBody);
  const [category, setCategory] = useState<Category>(initial.category);
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const [test, setTest] = useState<TestState>({ status: "idle" });
  const [testTo, setTestTo] = useState("");
  const [testOpen, setTestOpen] = useState(false);
  const [varsOpen, setVarsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Last saved snapshot — drives `dirty` locally so autosave settles after a
  // save instead of looping until the server-component props refresh.
  const [baseline, setBaseline] = useState({ name: initial.name, subject: initial.subject, htmlBody: initial.htmlBody, category: initial.category });

  const subjectRef = useRef<HTMLInputElement>(null);

  const dirty = useMemo(
    () =>
      name !== baseline.name ||
      subject !== baseline.subject ||
      htmlBody !== baseline.htmlBody ||
      category !== baseline.category,
    [name, subject, htmlBody, category, baseline],
  );

  // Warn user before leaving with unsaved changes
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const handleSave = useCallback(async (opts?: { silent?: boolean }) => {
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
    setBaseline({ name, subject, htmlBody, category });
    setSave({ status: "saved" });
    setTimeout(() => setSave({ status: "idle" }), 2000);
    // Autosave runs `silent` — router.refresh() re-renders the route and, mid
    // drag-drop in the email builder, tears down the canvas and loses the drop.
    if (!opts?.silent) router.refresh();
  }, [name, subject, htmlBody, category, initial.id, initial.isSystem, router]);

  // Autosave — debounced 3s after the last edit. Manual Save / Cmd+S still work.
  useEffect(() => {
    if (!dirty || save.status === "saving") return;
    const t = setTimeout(() => { handleSave({ silent: true }); }, 3000);
    return () => clearTimeout(t);
  }, [dirty, name, subject, htmlBody, category, save.status, handleSave]);

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

  // Subject-only variable insert (body variables live in the builder's panel).
  function insertVariable(key: string) {
    const token = `{{${key}}}`;
    const el = subjectRef.current;
    if (!el) { setSubject(subject + token); return; }
    const start = el.selectionStart ?? subject.length;
    const end = el.selectionEnd ?? subject.length;
    setSubject(subject.slice(0, start) + token + subject.slice(end));
    requestAnimationFrame(() => { el.focus(); const pos = start + token.length; el.setSelectionRange(pos, pos); });
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
    <div className="flex flex-col h-screen">
      {/* Single action bar — back · name · subject · category · test · save · delete */}
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-gray-200 bg-white shrink-0">
        <Link
          href={`/${slug}/emails/templates`}
          className="p-1.5 -ml-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
        >
          <ArrowLeft size={18} />
        </Link>

        {initial.isSystem && <Lock size={13} className="text-gray-400 shrink-0" />}

        {/* Subject (flex) with variable popover */}
        <div className="relative flex-1 min-w-0">
          <input
            ref={subjectRef}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
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

        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setSettingsOpen((o) => !o)}
            title="Settings"
            className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Settings size={16} />
          </button>
          {settingsOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setSettingsOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-20 w-56 bg-white border border-gray-200 rounded-lg shadow-lg p-3 space-y-2.5">
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-1">Name</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Template name"
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                {!initial.isSystem && (
                  <label className="block">
                    <span className="block text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-1">Category</span>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as Category)}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="MARKETING">Marketing</option>
                      <option value="TRANSACTIONAL">Transactional</option>
                    </select>
                  </label>
                )}
              </div>
            </>
          )}
        </div>

        <button
          onClick={() => setTestOpen((o) => !o)}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50 rounded-lg transition-colors shrink-0"
        >
          <Send size={12} /> Test send
        </button>

        <span className="hidden md:inline text-[11px] text-gray-400 shrink-0 min-w-[58px] text-right">
          {save.status === "saving" ? "Saving…" : save.status === "saved" ? "Saved" : dirty ? "Unsaved" : "Saved"}
        </span>

        <button
          onClick={() => handleSave()}
          disabled={!dirty || save.status === "saving"}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg transition-colors shrink-0"
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
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
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
            <button
              type="button"
              onClick={() => { setTestOpen(false); setTest({ status: "idle" }); }}
              title="Close"
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 rounded-lg transition-colors shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Save error */}
      {save.status === "error" && (
        <div className="px-4 sm:px-6 py-2 bg-red-50 border-b border-red-200 text-sm text-red-700 flex items-center gap-2 shrink-0">
          <AlertCircle size={14} /> {save.message}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 min-h-0 p-3 bg-white">
        <EmailBuilder value={htmlBody} onChange={setHtmlBody} />
      </div>
    </div>
  );
}
