"use client";

import { useEffect, useMemo, useState } from "react";
import { Bot, Loader2, Check, AlertCircle, Eye, EyeOff, ExternalLink, History, ChevronDown, ChevronUp, X as XIcon } from "lucide-react";
import { useToast } from "../ui/Toast";
import { apiFetch } from "../../lib/api-client";
import { useRole } from "../../lib/role";

type Provider = "anthropic" | "google" | "deepseek" | "openai";

type Settings = {
  provider: Provider;
  model: string;
  enabled: boolean;
  hasApiKey: boolean;
  apiKey: string;
};

const MODELS: { id: string; provider: Provider; label: string; hint: string }[] = [
  { id: "claude-haiku-4-5-20251001", provider: "anthropic", label: "Claude Haiku 4.5", hint: "Fast + cheap." },
  { id: "claude-sonnet-4-6",         provider: "anthropic", label: "Claude Sonnet 4.6", hint: "Balanced." },
  { id: "claude-opus-4-7",           provider: "anthropic", label: "Claude Opus 4.7",   hint: "Most capable. Costly." },
  { id: "gemini-2.5-flash",          provider: "google",    label: "Gemini 2.5 Flash",  hint: "Higher quality, free tier." },
  { id: "gemini-2.5-pro",            provider: "google",    label: "Gemini 2.5 Pro",    hint: "Most capable Gemini." },
  { id: "deepseek-chat",             provider: "deepseek",  label: "DeepSeek V3 (chat)", hint: "Cheapest. Top up $5 covers months of use." },
  { id: "gpt-4o-mini",               provider: "openai",    label: "GPT-4o mini",       hint: "Cheap + fast." },
  { id: "gpt-4o",                    provider: "openai",    label: "GPT-4o",            hint: "Balanced quality + speed." },
];

const PROVIDERS: { id: Provider; label: string; keyHint: string; consoleUrl: string; badge?: string }[] = [
  { id: "google",    label: "Google Gemini",     keyHint: "AIzaSy...",  consoleUrl: "https://aistudio.google.com/apikey",          },
  { id: "openai",    label: "OpenAI (ChatGPT)",  keyHint: "sk-...",     consoleUrl: "https://platform.openai.com/api-keys",        },
  { id: "deepseek",  label: "DeepSeek",          keyHint: "sk-...",     consoleUrl: "https://platform.deepseek.com/api_keys", },
  { id: "anthropic", label: "Anthropic Claude",  keyHint: "sk-ant-...", consoleUrl: "https://console.anthropic.com/settings/keys" },
];

const DEFAULT_MODEL_BY_PROVIDER: Record<Provider, string> = {
  anthropic: "claude-haiku-4-5-20251001",
  google:    "gemini-2.0-flash",
  deepseek:  "deepseek-chat",
  openai:    "gpt-4o-mini",
};

const inputCls =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white " +
  "focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400";

export default function AiAssistantPanel() {
  const toast = useToast();
  const { canManageAi } = useRole();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [provider, setProvider] = useState<Provider>("google");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState("gemini-2.0-flash");
  const [enabled, setEnabled] = useState(true);

  const currentProvider = PROVIDERS.find((p) => p.id === provider)!;
  const filteredModels = useMemo(() => MODELS.filter((m) => m.provider === provider), [provider]);

  useEffect(() => {
    void load();
  }, []);

  // When provider changes, reset to its default model.
  useEffect(() => {
    if (!filteredModels.some((m) => m.id === model)) {
      setModel(DEFAULT_MODEL_BY_PROVIDER[provider]);
    }
  }, [provider, filteredModels, model]);

  async function load() {
    setLoading(true);
    try {
      const res = await apiFetch("/api/ai/settings");
      const json = await res.json();
      if (json.success) {
        setSettings(json.data);
        setProvider(json.data.provider);
        setModel(json.data.model);
        setEnabled(json.data.enabled);
        // Populate input with the stored key (matches PaymentPanel pattern).
        // UI hides it behind the eye toggle by default.
        setApiKey(json.data.apiKey ?? "");
      }
    } finally {
      setLoading(false);
    }
  }

  const switchingProvider = settings?.hasApiKey && settings.provider !== provider;

  async function handleSave() {
    if ((!settings?.hasApiKey || switchingProvider) && !apiKey.trim()) {
      toast.warning(switchingProvider
        ? `Provider changed — enter the new ${currentProvider.label} API key.`
        : "Enter your API key first.");
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch("/api/ai/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          model,
          apiKey: apiKey.trim() || undefined,
          enabled,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSettings(json.data);
        setApiKey(json.data.apiKey ?? "");
        toast.success("AI assistant settings saved");
      } else {
        toast.error(json.error ?? "Failed to save");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("Remove the API key and disable the AI assistant?")) return;
    setSaving(true);
    try {
      const res = await apiFetch("/api/ai/settings", { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        setSettings({ provider: "google", model: "gemini-2.0-flash", enabled: false, hasApiKey: false, apiKey: "" });
        setProvider("google");
        setModel("gemini-2.0-flash");
        setEnabled(false);
        setApiKey("");
        toast.success("AI assistant disconnected");
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400">
        <Loader2 size={18} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
          <Bot size={18} />
        </div>
        <div>
          <h2 className="text-base font-semibold text-gray-900">AI Assistant</h2>
          <p className="text-xs text-gray-500">Bring your own API key — usage billed by the provider, not by us.</p>
        </div>
      </div>

      {settings?.hasApiKey && settings.enabled && (
        <div className="mt-4 mb-4 flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
          <Check size={14} /> Connected via {PROVIDERS.find((p) => p.id === settings.provider)?.label}.
          Floating chat widget is available.
        </div>
      )}
      {settings?.hasApiKey && !settings.enabled && (
        <div className="mt-4 mb-4 flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
          <AlertCircle size={14} /> API key on file but assistant is disabled.
        </div>
      )}
      {switchingProvider && (
        <div className="mt-4 mb-4 flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
          <AlertCircle size={14} /> Switching providers — enter a new API key for {currentProvider.label}.
        </div>
      )}

      <div className="space-y-4 mt-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Provider</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setProvider(p.id)}
                disabled={!canManageAi}
                className={`text-left px-3 py-2.5 rounded-lg border transition-colors ${
                  provider === p.id
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 bg-white hover:bg-gray-50"
                } ${!canManageAi ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-900 truncate">{p.label}</span>
                  {p.badge && (
                    <span className={`shrink-0 text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${
                      p.badge === "Free tier"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                    }`}>
                      {p.badge}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            {currentProvider.label} API key {(!settings?.hasApiKey || switchingProvider) && <span className="text-red-500">*</span>}
          </label>
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                settings?.hasApiKey && !switchingProvider
                  ? "•••••••• (stored — leave blank to keep)"
                  : currentProvider.keyHint
              }
              disabled={!canManageAi}
              // Block Chrome saved-password autofill on credential settings.
              autoComplete="new-password"
              name="ai-api-key"
              data-form-type="other"
              className={inputCls + " pr-9" + (!canManageAi ? " bg-gray-50 cursor-not-allowed text-gray-500" : "")}
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
              tabIndex={-1}
            >
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <p className="mt-1 text-[11px] text-gray-400">
            Get a key at{" "}
            <a
              href={currentProvider.consoleUrl}
              target="_blank"
              rel="noreferrer"
              className="underline inline-flex items-center gap-0.5 text-gray-600"
            >
              {new URL(currentProvider.consoleUrl).hostname} <ExternalLink size={10} />
            </a>
            {" — "}encrypted at rest, never sent to us.
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Model</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={!canManageAi}
            className={inputCls + (!canManageAi ? " bg-gray-50 cursor-not-allowed text-gray-500" : "")}
          >
            {filteredModels.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-gray-400">{filteredModels.find((m) => m.id === model)?.hint}</p>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            disabled={!canManageAi}
            className="rounded border-gray-300"
          />
          Enable AI assistant
        </label>

        {canManageAi && (
          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 inline-flex items-center gap-2"
            >
              {saving && <Loader2 size={14} className="animate-spin" />} Save
            </button>
            {settings?.hasApiKey && (
              <button
                onClick={handleDisconnect}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
              >
                Disconnect
              </button>
            )}
          </div>
        )}
      </div>

      {settings?.hasApiKey && <AuditLogSection />}
    </div>
  );
}

// ─── Audit log section ──────────────────────────────────────────────────────
// Lists every tool the AI executed on user's behalf — important for trust +
// "what did AI do yesterday?" lookups. Reads from AiMessage table directly.

type AuditAction = {
  id: string;
  toolName: string | null;
  status: string | null;
  args: any;
  result: any;
  createdAt: string;
};

const STATUS_BADGE: Record<string, string> = {
  executed:        "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected:        "bg-gray-50 text-gray-600 border-gray-200",
  error:           "bg-red-50 text-red-700 border-red-200",
  pending_confirm: "bg-amber-50 text-amber-700 border-amber-200",
  approved:        "bg-blue-50 text-blue-700 border-blue-200",
};

function AuditLogSection() {
  const [actions, setActions] = useState<AuditAction[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await apiFetch("/api/ai/audit");
      const json = await res.json();
      if (json.success) setActions(json.data.actions);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-8 pt-6 border-t border-gray-200">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <History size={16} className="text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">Recent AI actions</h3>
          {actions !== null && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
              {actions.length}
            </span>
          )}
        </div>
        <button onClick={load} disabled={loading} className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50">
          {loading ? <Loader2 size={12} className="animate-spin inline" /> : "Refresh"}
        </button>
      </div>
      <p className="text-xs text-gray-400 mb-3">
        Every tool call AI made on your behalf — newest first. Use this to verify what the assistant did.
      </p>

      {actions === null ? (
        <div className="flex items-center justify-center py-8 text-gray-400">
          <Loader2 size={16} className="animate-spin" />
        </div>
      ) : actions.length === 0 ? (
        <div className="text-center py-6 text-xs text-gray-400 bg-gray-50 rounded-lg">
          No AI actions yet. They'll appear here as you chat.
        </div>
      ) : (
        <div className="space-y-1.5">
          {actions.map((a) => (
            <div key={a.id} className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setExpanded(expanded === a.id ? null : a.id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50"
              >
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${STATUS_BADGE[a.status ?? ""] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
                  {a.status ?? "unknown"}
                </span>
                <code className="flex-1 text-xs font-mono text-gray-800 truncate">{a.toolName}</code>
                <span className="text-[10px] text-gray-400 shrink-0">
                  {new Date(a.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
                {expanded === a.id
                  ? <ChevronUp size={12} className="text-gray-400 shrink-0" />
                  : <ChevronDown size={12} className="text-gray-400 shrink-0" />}
              </button>
              {expanded === a.id && (
                <div className="px-3 py-2 border-t border-gray-100 bg-gray-50 space-y-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-1">Args</p>
                    <pre className="text-[11px] font-mono text-gray-700 bg-white p-2 rounded border border-gray-200 overflow-x-auto whitespace-pre-wrap break-all">
                      {JSON.stringify(a.args, null, 2)}
                    </pre>
                  </div>
                  {a.result !== null && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-1">Result</p>
                      <pre className="text-[11px] font-mono text-gray-700 bg-white p-2 rounded border border-gray-200 overflow-x-auto whitespace-pre-wrap break-all">
                        {typeof a.result === "string" ? a.result : JSON.stringify(a.result, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
