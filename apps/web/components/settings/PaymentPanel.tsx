"use client";

import { useState } from "react";
import {
  Save, Loader2, Check, Eye, EyeOff, CreditCard,
  CheckCircle, XCircle, AlertCircle, ExternalLink, Zap,
  ChevronDown, Copy, BookOpen,
} from "lucide-react";

const RENDERER_URL = process.env.NEXT_PUBLIC_RENDERER_URL ?? "http://localhost:3001";
const WEBHOOK_URL  = `${RENDERER_URL.replace(/\/$/, "")}/api/webhook/stripe`;
const PAYPAL_WEBHOOK_URL = `${RENDERER_URL.replace(/\/$/, "")}/api/webhook/paypal`;

const WEBHOOK_EVENTS = [
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice_payment.paid",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.closed",
];

const PAYPAL_WEBHOOK_EVENTS = [
  "BILLING.SUBSCRIPTION.ACTIVATED",
  "BILLING.SUBSCRIPTION.CANCELLED",
  "BILLING.SUBSCRIPTION.EXPIRED",
  "BILLING.SUBSCRIPTION.PAYMENT.FAILED",
  "PAYMENT.CAPTURE.COMPLETED",
  "PAYMENT.CAPTURE.DENIED",
  "PAYMENT.CAPTURE.REVERSED",
  "PAYMENT.CAPTURE.REFUNDED",
  "PAYMENT.SALE.COMPLETED",
  "PAYMENT.SALE.REFUNDED",
  "CUSTOMER.DISPUTE.CREATED",
  "CUSTOMER.DISPUTE.RESOLVED",
];

// ─── Types ────────────────────────────────────────────────────────────────────

type StripeData = {
  publishableKey: string;
  secretKey: string;
  webhookSecret: string | null;
  mode: string;
} | null;

type PaypalData = {
  clientId: string;
  clientSecret: string;
  webhookId: string | null;
  mode: string;
} | null;

type TestResult =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "ok";   data: Record<string, string | boolean | null> }
  | { status: "fail"; message: string };

// ─── Validation helpers ───────────────────────────────────────────────────────

function validateStripeKey(key: string, prefix: "pk" | "sk" | "whsec") {
  if (!key) return "empty";
  if (prefix === "whsec") return key.startsWith("whsec_") ? "valid" : "invalid";
  return key.startsWith(`${prefix}_test_`) || key.startsWith(`${prefix}_live_`)
    ? "valid" : "invalid";
}

function detectStripeMode(pk: string, sk: string): "test" | "live" | null {
  if (pk.startsWith("pk_test_") || sk.startsWith("sk_test_")) return "test";
  if (pk.startsWith("pk_live_") || sk.startsWith("sk_live_")) return "live";
  return null;
}

function KeyStatus({ status }: { status: "empty" | "valid" | "invalid" }) {
  if (status === "empty")   return null;
  if (status === "valid")   return <CheckCircle size={14} className="text-green-500 shrink-0" />;
  return <XCircle size={14} className="text-red-400 shrink-0" />;
}

// ─── Shared components ────────────────────────────────────────────────────────

function SecretInput({
  label, value, onChange, placeholder, hint, validity,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  validity: "empty" | "valid" | "invalid";
}) {
  const [show, setShow] = useState(false);
  const borderCls =
    validity === "valid"   ? "border-green-400 focus:ring-green-400" :
    validity === "invalid" ? "border-red-300 focus:ring-red-400" :
                             "border-gray-200 focus:ring-blue-500";

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative flex items-center">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full border rounded-xl px-3 py-2.5 pr-16 text-sm font-mono text-gray-800 bg-white focus:outline-none focus:ring-2 placeholder:text-gray-300 transition-colors ${borderCls}`}
        />
        <div className="absolute right-3 flex items-center gap-1.5">
          <KeyStatus status={validity} />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="text-gray-400 hover:text-gray-600"
          >
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

function TextInput({
  label, value, onChange, placeholder, hint, validity,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  validity: "empty" | "valid" | "invalid";
}) {
  const borderCls =
    validity === "valid"   ? "border-green-400 focus:ring-green-400" :
    validity === "invalid" ? "border-red-300 focus:ring-red-400" :
                             "border-gray-200 focus:ring-blue-500";

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative flex items-center">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full border rounded-xl px-3 py-2.5 pr-8 text-sm font-mono text-gray-800 bg-white focus:outline-none focus:ring-2 placeholder:text-gray-300 transition-colors ${borderCls}`}
        />
        <div className="absolute right-3">
          <KeyStatus status={validity} />
        </div>
      </div>
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

function ModeToggle({
  value, onChange, options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; color: string }[];
}) {
  return (
    <div className="flex gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
            value === opt.value
              ? `${opt.color} text-white border-transparent`
              : "border-gray-200 text-gray-500 hover:border-gray-300 bg-white"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function TestResultBanner({ result }: { result: TestResult }) {
  if (result.status === "idle" || result.status === "testing") return null;

  if (result.status === "fail") {
    return (
      <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
        <XCircle size={15} className="shrink-0 mt-0.5" />
        <span>{result.message}</span>
      </div>
    );
  }

  const lines = Object.entries(result.data).filter(([, v]) => v !== null && v !== undefined);
  return (
    <div className="flex items-start gap-2 px-3 py-2.5 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
      <CheckCircle size={15} className="shrink-0 mt-0.5" />
      <div>
        <p className="font-medium">Connection successful</p>
        {lines.map(([k, v]) => (
          <p key={k} className="text-xs text-green-600 mt-0.5">
            {k}: <span className="font-mono">{String(v)}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

// ─── Webhook setup guide ─────────────────────────────────────────────────────

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }
  return (
    <div className="flex items-stretch gap-0">
      <code className="flex-1 px-3 py-2 text-xs font-mono text-gray-700 bg-gray-50 border border-gray-200 rounded-l-lg truncate">
        {value}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        className="flex items-center gap-1 px-3 text-xs font-medium text-gray-600 bg-white border border-l-0 border-gray-200 hover:bg-gray-50 rounded-r-lg transition-colors shrink-0"
      >
        {copied ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function PaypalWebhookSetupGuide({ mode }: { mode: string }) {
  const [open, setOpen] = useState(false);
  const dashboardUrl = mode === "live"
    ? "https://developer.paypal.com/dashboard/applications/live"
    : "https://developer.paypal.com/dashboard/applications/sandbox";

  return (
    <div className="border border-gray-200 rounded-xl bg-gray-50/50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <BookOpen size={14} className="text-blue-500 shrink-0" />
        <span className="flex-1 text-left">How to set up the webhook</span>
        <ChevronDown size={14} className={`text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-4 py-3 border-t border-gray-200 bg-white space-y-4">
          {/* Step 1 */}
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-1.5">
              1. Endpoint URL — paste this into PayPal
            </p>
            <CopyField value={PAYPAL_WEBHOOK_URL} />
          </div>

          {/* Step 2 */}
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-1.5">
              2. Open PayPal Developer Dashboard → click your app → scroll to <span className="font-mono text-[11px]">Webhooks</span> → Add Webhook
            </p>
            <a
              href={dashboardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              Open {mode === "live" ? "live" : "sandbox"} apps <ExternalLink size={11} />
            </a>
          </div>

          {/* Step 3 */}
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-1.5">
              3. Select these event types
            </p>
            <ul className="text-xs font-mono text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 space-y-0.5 max-h-48 overflow-y-auto">
              {PAYPAL_WEBHOOK_EVENTS.map((e) => (
                <li key={e}>• {e}</li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs text-gray-400">
              Covers subscriptions, captures, refunds, and disputes.
            </p>
          </div>

          {/* Step 4 */}
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-1.5">
              4. After saving, copy the <span className="font-mono text-[11px]">Webhook ID</span> (e.g. <span className="font-mono text-[11px]">5AB12345CD678901E</span>) and paste it into the Webhook ID field above.
            </p>
            <p className="mt-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded-lg">
              Without the Webhook ID, signature verification is skipped.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function WebhookSetupGuide({ mode }: { mode: string }) {
  const [open, setOpen] = useState(false);
  const dashboardUrl = mode === "live"
    ? "https://dashboard.stripe.com/webhooks"
    : "https://dashboard.stripe.com/test/webhooks";

  return (
    <div className="border border-gray-200 rounded-xl bg-gray-50/50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <BookOpen size={14} className="text-blue-500 shrink-0" />
        <span className="flex-1 text-left">How to set up the webhook</span>
        <ChevronDown size={14} className={`text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-4 py-3 border-t border-gray-200 bg-white space-y-4">
          {/* Step 1 */}
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-1.5">
              1. Endpoint URL — paste this into Stripe
            </p>
            <CopyField value={WEBHOOK_URL} />
          </div>

          {/* Step 2 */}
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-1.5">
              2. Go to Stripe Dashboard and add a new webhook endpoint
            </p>
            <a
              href={dashboardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              Open {mode === "live" ? "live" : "test"} webhooks <ExternalLink size={11} />
            </a>
          </div>

          {/* Step 3 */}
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-1.5">
              3. Select these events to listen for
            </p>
            <ul className="text-xs font-mono text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 space-y-0.5">
              {WEBHOOK_EVENTS.map((e) => (
                <li key={e}>• {e}</li>
              ))}
            </ul>
          </div>

          {/* Step 4 */}
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-1.5">
              4. Copy the signing secret (whsec_…) and paste it into the field above.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Stripe form ──────────────────────────────────────────────────────────────

function StripeForm({ initial }: { initial: StripeData }) {
  const [pk, setPk]     = useState(initial?.publishableKey ?? "");
  const [sk, setSk]     = useState(initial?.secretKey ?? "");
  const [wh, setWh]     = useState(initial?.webhookSecret ?? "");
  const [mode, setMode] = useState(initial?.mode ?? "test");
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [test,    setTest]    = useState<TestResult>({ status: "idle" });

  // Auto-detect mode from key prefix
  function handlePkChange(v: string) {
    setPk(v);
    const detected = detectStripeMode(v, sk);
    if (detected) setMode(detected);
    setTest({ status: "idle" });
  }
  function handleSkChange(v: string) {
    setSk(v);
    const detected = detectStripeMode(pk, v);
    if (detected) setMode(detected);
    setTest({ status: "idle" });
  }

  const pkValidity  = validateStripeKey(pk, "pk");
  const skValidity  = validateStripeKey(sk, "sk");
  const whValidity  = wh ? validateStripeKey(wh, "whsec") : "empty";
  const canTest     = skValidity === "valid";
  const canSave     = pkValidity === "valid" && skValidity === "valid" && (whValidity === "valid" || whValidity === "empty");

  async function handleTest() {
    setTest({ status: "testing" });
    const res  = await fetch("/api/settings/payment/stripe/test", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ secretKey: sk }),
    });
    const json = await res.json();
    if (!res.ok) {
      setTest({ status: "fail", message: json.error ?? "Connection failed" });
    } else {
      setTest({ status: "ok", data: {
        "Account ID": json.data.id,
        "Name":       json.data.name,
        "Email":      json.data.email,
        "Charges":    json.data.chargesEnabled ? "Enabled" : "Disabled",
      }});
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setSaveErr(null);
    const res  = await fetch("/api/settings/payment", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        provider: "stripe", publishableKey: pk, secretKey: sk,
        webhookSecret: wh || undefined, mode,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { setSaveErr(json.error ?? "Failed to save"); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {saveErr && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle size={14} /> {saveErr}
        </div>
      )}

      {/* Mode */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Mode</label>
        <ModeToggle
          value={mode}
          onChange={setMode}
          options={[
            { value: "test", label: "Test",  color: "bg-blue-500" },
            { value: "live", label: "Live",  color: "bg-green-600" },
          ]}
        />
        {mode === "live" && (
          <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
            Live mode will charge real cards. Double-check your keys.
          </p>
        )}
      </div>

      {/* Publishable key */}
      <TextInput
        label="Publishable key"
        value={pk}
        onChange={handlePkChange}
        placeholder="pk_test_..."
        hint="Starts with pk_test_ or pk_live_ — safe to expose on frontend."
        validity={pkValidity}
      />

      {/* Secret key */}
      <SecretInput
        label="Secret key"
        value={sk}
        onChange={handleSkChange}
        placeholder="sk_test_..."
        hint="Starts with sk_test_ or sk_live_ — never share or expose this."
        validity={skValidity}
      />

      {/* Webhook */}
      <SecretInput
        label="Webhook secret (optional)"
        value={wh}
        onChange={(v) => { setWh(v); setTest({ status: "idle" }); }}
        placeholder="whsec_..."
        hint="Required only if you sell subscriptions — see setup guide below."
        validity={whValidity}
      />

      <WebhookSetupGuide mode={mode} />


      {/* Test result */}
      <TestResultBanner result={test} />

      {/* Actions */}
      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={saving || !canSave}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-xl transition-colors"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : <Save size={14} />}
          {saved ? "Saved!" : "Save"}
        </button>

        <button
          type="button"
          onClick={handleTest}
          disabled={!canTest || test.status === "testing"}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-40 rounded-xl transition-colors"
        >
          {test.status === "testing"
            ? <Loader2 size={14} className="animate-spin" />
            : <Zap size={14} />}
          Test connection
        </button>

        <a
          href="https://dashboard.stripe.com/apikeys"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors ml-auto"
        >
          Get keys <ExternalLink size={11} />
        </a>
      </div>
    </form>
  );
}

// ─── PayPal form ──────────────────────────────────────────────────────────────

function PaypalForm({ initial }: { initial: PaypalData }) {
  const [clientId,     setClientId]     = useState(initial?.clientId ?? "");
  const [clientSecret, setClientSecret] = useState(initial?.clientSecret ?? "");
  const [webhookId,    setWebhookId]    = useState(initial?.webhookId ?? "");
  const [mode,         setMode]         = useState(initial?.mode ?? "sandbox");
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [test,    setTest]    = useState<TestResult>({ status: "idle" });

  const idValidity     = clientId.length > 10     ? "valid" : clientId ? "invalid" : "empty";
  const secretValidity = clientSecret.length > 10 ? "valid" : clientSecret ? "invalid" : "empty";
  const canSave        = idValidity === "valid" && secretValidity === "valid";
  const canTest        = canSave;

  async function handleTest() {
    setTest({ status: "testing" });
    const res  = await fetch("/api/settings/payment/paypal/test", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ clientId, clientSecret, mode }),
    });
    const json = await res.json();
    if (!res.ok) {
      setTest({ status: "fail", message: json.error ?? "Connection failed" });
    } else {
      setTest({ status: "ok", data: {
        "App ID": json.data.appId,
        "Mode":   mode,
      }});
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setSaveErr(null);
    const res  = await fetch("/api/settings/payment", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        provider: "paypal", clientId, clientSecret,
        webhookId: webhookId || undefined, mode,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { setSaveErr(json.error ?? "Failed to save"); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {saveErr && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle size={14} /> {saveErr}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Mode</label>
        <ModeToggle
          value={mode}
          onChange={(v) => { setMode(v); setTest({ status: "idle" }); }}
          options={[
            { value: "sandbox", label: "Sandbox", color: "bg-blue-500" },
            { value: "live",    label: "Live",    color: "bg-green-600" },
          ]}
        />
      </div>

      <TextInput
        label="Client ID"
        value={clientId}
        onChange={(v) => { setClientId(v); setTest({ status: "idle" }); }}
        placeholder="AaBbCcDd..."
        hint="From PayPal Developer → My Apps & Credentials."
        validity={idValidity}
      />

      <SecretInput
        label="Client Secret"
        value={clientSecret}
        onChange={(v) => { setClientSecret(v); setTest({ status: "idle" }); }}
        placeholder="EeFfGgHh..."
        hint="Never share this — used only on the server."
        validity={secretValidity}
      />

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Webhook ID <span className="text-gray-400 font-normal">(recommended)</span>
        </label>
        <input
          value={webhookId}
          onChange={(e) => setWebhookId(e.target.value)}
          placeholder="XXXXXXXXXXXX"
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-300"
        />
        <p className="mt-1 text-xs text-gray-400">From PayPal → Webhooks. Required to verify signatures — see setup guide below.</p>
      </div>

      <PaypalWebhookSetupGuide mode={mode} />

      <TestResultBanner result={test} />

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={saving || !canSave}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-xl transition-colors"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : <Save size={14} />}
          {saved ? "Saved!" : "Save"}
        </button>

        <button
          type="button"
          onClick={handleTest}
          disabled={!canTest || test.status === "testing"}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-40 rounded-xl transition-colors"
        >
          {test.status === "testing"
            ? <Loader2 size={14} className="animate-spin" />
            : <Zap size={14} />}
          Test connection
        </button>

        <a
          href="https://developer.paypal.com/dashboard/applications"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors ml-auto"
        >
          Get keys <ExternalLink size={11} />
        </a>
      </div>
    </form>
  );
}

// ─── Root component ───────────────────────────────────────────────────────────

const PROVIDERS = [
  { id: "stripe" as const, label: "Stripe",  accent: "text-violet-600" },
  { id: "paypal" as const, label: "PayPal",  accent: "text-blue-500"   },
];

export default function PaymentPanel({
  stripe,
  paypal,
}: {
  stripe: StripeData;
  paypal: PaypalData;
}) {
  const [active, setActive] = useState<"stripe" | "paypal">("stripe");
  const configured = { stripe: !!stripe, paypal: !!paypal };

  return (
    <div>
      <div className="flex items-center gap-2.5 mb-1">
        <CreditCard size={18} className="text-gray-700" />
        <h2 className="text-base font-semibold text-gray-900">Payment Settings</h2>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Connect a payment gateway to accept payments in your funnels.
      </p>

      {/* Provider selector */}
      <div className="flex gap-2 mb-6">
        {PROVIDERS.map(({ id, label, accent }) => (
          <button
            key={id}
            onClick={() => setActive(id)}
            className={`relative flex items-center gap-2 px-5 py-2.5 rounded-xl border text-sm font-medium transition-all ${
              active === id
                ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm"
                : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 bg-white"
            }`}
          >
            <span className={active === id ? "" : accent}>{label}</span>
            {configured[id] && (
              <span
                className="w-2 h-2 rounded-full bg-green-500"
                title="Configured"
              />
            )}
          </button>
        ))}
      </div>

      {/* Form */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 max-w-md">
        {active === "stripe" && <StripeForm initial={stripe} />}
        {active === "paypal" && <PaypalForm initial={paypal} />}
      </div>
    </div>
  );
}
