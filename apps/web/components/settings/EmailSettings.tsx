"use client";

import { useState } from "react";
import {
  Save, Loader2, Check, Eye, EyeOff, Mail,
  AlertCircle, Gauge, ChevronDown,
  Plus, Pencil, Trash2, Star, Send, X, CheckCircle2, AtSign,
} from "lucide-react";
import { useConfirm } from "../ui/ConfirmDialog";
import { useToast } from "../ui/Toast";
import EmailFooterPanel from "./EmailFooterPanel";
import { apiFetch } from "../../lib/api-client";

// ─── Types ────────────────────────────────────────────────────────────────────

type SmtpData = {
  provider:       string;
  host:           string;
  port:           number;
  username:       string;
  password:       string;
  maxPerDay:      number;
  maxPerSecond?:  number;
  maxConcurrent?: number;
} | null;

type Identity = {
  id:        string;
  name:      string;
  email:     string;
  isDefault: boolean;
};

// ─── Shared field styles ──────────────────────────────────────────────────────

const inputCls = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-300 transition-colors";
const inputSm  = "w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-300";

function Field({ label, required, children, hint }: {
  label: string; required?: boolean; children: React.ReactNode; hint?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

function SecretField({ label, value, onChange, placeholder, hint, required }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; hint?: string; required?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <Field label={label} required={required} hint={hint}>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`${inputCls} pr-10`}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </Field>
  );
}

// ─── Page root ────────────────────────────────────────────────────────────────

export default function EmailSettings({
  smtp, senderIdentities,
}: {
  smtp: SmtpData;
  senderIdentities: Identity[];
}) {
  return (
    <div className="space-y-8">
      <SmtpSection initial={smtp} />
      <hr className="border-gray-200" />
      <SenderIdentitiesSection initial={senderIdentities} />
      <hr className="border-gray-200" />
      <EmailFooterPanel />
    </div>
  );
}

// ─── SMTP section ─────────────────────────────────────────────────────────────

function SmtpSection({ initial }: { initial: SmtpData }) {
  const [host,          setHost]          = useState(initial?.host     ?? "");
  const [port,          setPort]          = useState(initial?.port     ?? 587);
  const [username,      setUsername]      = useState(initial?.username ?? "");
  const [password,      setPassword]      = useState(initial?.password ?? "");
  const [pwTouched,     setPwTouched]     = useState(false);
  const [maxPerDay,     setMaxPerDay]     = useState(initial?.maxPerDay     ?? 500);
  const [maxPerSecond,  setMaxPerSecond]  = useState(initial?.maxPerSecond  ?? 1);
  const [maxConcurrent, setMaxConcurrent] = useState(initial?.maxConcurrent ?? 1);
  const [showLimits,    setShowLimits]    = useState(false);

  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setSaveErr(null);

    const body: Record<string, unknown> = {
      provider: "CUSTOM",
      host, port: Number(port),
      username,
      maxPerDay:     Number(maxPerDay),
      maxPerSecond:  Number(maxPerSecond),
      maxConcurrent: Number(maxConcurrent),
      password:      pwTouched ? password : "__KEEP__",
    };

    const res  = await apiFetch("/api/settings/smtp", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { setSaveErr(json.error ?? "Failed to save"); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const canSave =
    host && username &&
    (initial ? (pwTouched ? password.length > 0 : true) : pwTouched && password.length > 0);

  return (
    <section>
      <div className="flex items-center gap-2.5 mb-1">
        <Mail size={18} className="text-gray-700" />
        <h2 className="text-base font-semibold text-gray-900">SMTP Server</h2>
      </div>
      <p className="text-sm text-gray-500 mb-5">
        Connection settings for your outgoing mail server.
      </p>

      <form onSubmit={handleSave} className="space-y-4">
        {saveErr && (
          <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <AlertCircle size={14} /> {saveErr}
          </div>
        )}

        {/* Host + Port */}
        <div className="grid grid-cols-4 gap-3">
          <div className="col-span-3">
            <Field label="Host" required>
              <input
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="smtp.example.com"
                className={inputCls}
              />
            </Field>
          </div>
          <Field label="Port" required>
            <select
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              className={inputCls}
            >
              <option value={587}>587</option>
              <option value={465}>465</option>
              <option value={25}>25</option>
              <option value={2525}>2525</option>
            </select>
          </Field>
        </div>

        {/* Username + Password */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Username" required>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
              className={inputCls}
            />
          </Field>
          <SecretField
            label="Password"
            value={password}
            onChange={(v) => { setPassword(v); setPwTouched(true); }}
            placeholder="Password or API key"
            required={!initial}
          />
        </div>

        {/* Rate limits (collapsible) */}
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowLimits((s) => !s)}
            className="w-full flex items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Gauge size={14} className="text-gray-500" />
              Rate limits
              <span className="text-xs font-normal text-gray-400">
                {maxPerSecond}/sec · {maxConcurrent} conn · {maxPerDay.toLocaleString()}/day
              </span>
            </span>
            <ChevronDown size={14} className={`text-gray-400 transition-transform ${showLimits ? "rotate-180" : ""}`} />
          </button>

          {showLimits && (
            <div className="px-4 pb-4 pt-1 space-y-3 border-t border-gray-100">
              <div className="grid grid-cols-3 gap-3">
                <Field label="Max / second">
                  <input
                    type="number" min={1}
                    value={maxPerSecond}
                    onChange={(e) => setMaxPerSecond(Number(e.target.value))}
                    className={inputCls}
                  />
                </Field>
                <Field label="Max concurrent">
                  <input
                    type="number" min={1}
                    value={maxConcurrent}
                    onChange={(e) => setMaxConcurrent(Number(e.target.value))}
                    className={inputCls}
                  />
                </Field>
                <Field label="Max / day">
                  <input
                    type="number" min={1}
                    value={maxPerDay}
                    onChange={(e) => setMaxPerDay(Number(e.target.value))}
                    className={inputCls}
                  />
                </Field>
              </div>
            </div>
          )}
        </div>

        {/* Save */}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={saving || !canSave}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-xl transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : <Save size={14} />}
            {saved ? "Saved" : "Save"}
          </button>
        </div>
      </form>
    </section>
  );
}

// ─── Sender Identities section ────────────────────────────────────────────────

function SenderIdentitiesSection({ initial }: { initial: Identity[] }) {
  const [items, setItems]     = useState<Identity[]>(initial);
  const [editing, setEditing] = useState<Identity | "new" | null>(null);
  const [busy, setBusy]       = useState<string | null>(null);
  const [testFor, setTestFor] = useState<Identity | null>(null);
  const confirm = useConfirm();
  const toast = useToast();

  async function refresh() {
    const res = await apiFetch("/api/sender-identities");
    const json = await res.json();
    if (json.success) setItems(json.data);
  }

  async function setDefault(id: Identity) {
    if (id.isDefault) return;
    setBusy(id.id);
    const res = await apiFetch(`/api/sender-identities/${id.id}/default`, { method: "POST" });
    setBusy(null);
    if ((await res.json()).success) refresh();
  }

  async function handleDelete(id: Identity) {
    const ok = await confirm({
      title: "Delete sender identity?",
      description: `"${id.name} <${id.email}>" will be removed. Steps already saved with this identity keep working (snapshot).`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    setBusy(id.id);
    const res = await apiFetch(`/api/sender-identities/${id.id}`, { method: "DELETE" });
    const json = await res.json();
    setBusy(null);
    if (!json.success) { toast.error(json.error ?? "Failed to delete identity"); return; }
    refresh();
  }

  return (
    <section>
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <AtSign size={18} className="text-gray-700" />
            <h2 className="text-base font-semibold text-gray-900">Sender Identities</h2>
          </div>
          <p className="text-sm text-gray-500">
            "From" addresses available when composing broadcasts and automations.
          </p>
        </div>
        <button
          onClick={() => setEditing("new")}
          className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shrink-0"
        >
          <Plus size={14} /> Add identity
        </button>
      </div>

      {items.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-200 rounded-xl py-12 px-4 text-center">
          <p className="text-sm text-gray-500 mb-3">No sender identities yet.</p>
          <button
            onClick={() => setEditing("new")}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors"
          >
            <Plus size={14} /> Add your first identity
          </button>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          {items.map((id) => (
            <div key={id.id} className="flex items-center gap-3 px-4 py-3">
              <button
                onClick={() => setDefault(id)}
                disabled={busy === id.id}
                className={`shrink-0 p-1.5 rounded-lg transition-colors ${
                  id.isDefault
                    ? "text-amber-500 cursor-default"
                    : "text-gray-300 hover:text-amber-500 hover:bg-amber-50"
                }`}
                title={id.isDefault ? "Default" : "Make default"}
              >
                <Star size={16} fill={id.isDefault ? "currentColor" : "none"} />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {id.name}
                  {id.isDefault && (
                    <span className="ml-2 text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
                      default
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-500 truncate">{id.email}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setTestFor(id)}
                  className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                  title="Send test"
                >
                  <Send size={14} />
                </button>
                <button
                  onClick={() => setEditing(id)}
                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="Edit"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDelete(id)}
                  disabled={busy === id.id}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                  title="Delete"
                >
                  {busy === id.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <EditDialog
          identity={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }}
        />
      )}
      {testFor && (
        <TestDialog identity={testFor} onClose={() => setTestFor(null)} />
      )}
    </section>
  );
}

// ─── Edit/Add dialog ──────────────────────────────────────────────────────────

function EditDialog({
  identity, onClose, onSaved,
}: {
  identity: Identity | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName]         = useState(identity?.name ?? "");
  const [email, setEmail]       = useState(identity?.email ?? "");
  const [isDefault, setDefault] = useState(identity?.isDefault ?? false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const isNew = identity === null;

  async function handleSave() {
    setSaving(true); setError(null);
    const url    = isNew ? "/api/sender-identities" : `/api/sender-identities/${identity.id}`;
    const method = isNew ? "POST" : "PATCH";
    const body   = isNew ? { name, email, isDefault } : { name, email };
    const res    = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setSaving(false);
    if (!json.success) { setError(json.error ?? "Failed"); return; }

    if (!isNew && isDefault && !identity!.isDefault) {
      await apiFetch(`/api/sender-identities/${identity!.id}/default`, { method: "POST" });
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-md bg-white rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">
            {isNew ? "Add sender identity" : "Edit identity"}
          </h3>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
            <X size={14} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {error && (
            <div className="flex items-start gap-2 px-3 py-2 text-xs rounded-lg bg-red-50 text-red-700">
              <AlertCircle size={12} className="mt-0.5 shrink-0" /> {error}
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">From name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Brand Support"
              className={inputSm}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">From email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="support@brand.com"
              className={inputSm}
            />
          </div>
          {isNew && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isDefault} onChange={(e) => setDefault(e.target.checked)} />
              <span>Set as default sender</span>
            </label>
          )}
          {!isNew && !identity!.isDefault && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isDefault} onChange={(e) => setDefault(e.target.checked)} />
              <span>Promote to default</span>
            </label>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name || !email}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : null}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Test send dialog ─────────────────────────────────────────────────────────

function TestDialog({
  identity, onClose,
}: {
  identity: Identity;
  onClose: () => void;
}) {
  const [sendTo, setSendTo] = useState("");
  const [state, setState]   = useState<"idle" | "sending" | "ok" | "err">("idle");
  const [error, setError]   = useState<string | null>(null);

  async function handleTest() {
    setState("sending"); setError(null);
    const res = await apiFetch(`/api/sender-identities/${identity.id}/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sendTo }),
    });
    const json = await res.json();
    if (!json.success) {
      setState("err");
      setError(json.error ?? "Failed to send test");
      return;
    }
    setState("ok");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-md bg-white rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Send size={14} /> Send test email
          </h3>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
            <X size={14} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
            Sending from: <strong className="text-gray-900">{identity.name}</strong> &lt;{identity.email}&gt;
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Send to (recipient)</label>
            <input
              type="email"
              value={sendTo}
              onChange={(e) => setSendTo(e.target.value)}
              placeholder="you@example.com"
              disabled={state === "sending"}
              className={inputSm}
            />
          </div>

          {state === "ok" && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-xs">
              <CheckCircle2 size={13} className="mt-0.5 shrink-0" />
              <span>Test email sent. Check the inbox of <strong>{sendTo}</strong> (and the spam folder).</span>
            </div>
          )}
          {state === "err" && error && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 text-red-700 text-xs">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold mb-0.5">SMTP rejected the send</p>
                <p className="break-words">{error}</p>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors"
          >
            Close
          </button>
          <button
            onClick={handleTest}
            disabled={state === "sending" || !sendTo}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
          >
            {state === "sending" ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            Send test
          </button>
        </div>
      </div>
    </div>
  );
}
