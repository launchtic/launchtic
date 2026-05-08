"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Save, Loader2, Check, AlertCircle, Trash2, Play, Pause,
  Plus, Mail, Tag as TagIcon, Webhook, Zap,
  ShoppingCart, FormInput, MousePointerClick, ChevronUp, ChevronDown, History,
  Pencil, X, Repeat, Undo2, AlertTriangle,
} from "lucide-react";
import { WELCOME_EMAIL_DOC } from "@launchtic/email";
import { useConfirm } from "../ui/ConfirmDialog";
import { useToast } from "../ui/Toast";
import EmailComposeDrawer, { EmailComposeButton } from "../emails/EmailComposeDrawer";
import { validateAutomation, type ValidationIssue } from "../../lib/automation-validation";

type Status = "DRAFT" | "ACTIVE" | "PAUSED";
type TriggerType = "NEW_SALE" | "SALE_CANCELED" | "SUBSCRIPTION_PAYMENT_FAILED" | "FORM_SUBMIT" | "TAG_ADDED" | "TAG_REMOVED" | "EMAIL_LINK_CLICKED";
type ActionType = "SEND_EMAIL" | "ADD_TAG" | "REMOVE_TAG" | "WEBHOOK" | "START_SEQUENCE" | "END_SEQUENCE";

type Action = {
  id?: string;
  order: number;
  actionType: ActionType;
  actionConfig: Record<string, any>;
  emailTemplateId: string | null;
  emailSubject: string | null;
  emailHtmlBody: string | null;
  emailFromName: string | null;
  emailFromEmail: string | null;
};

type Initial = {
  id: string;
  name: string;
  status: Status;
  triggerType: TriggerType;
  triggerConfig: Record<string, unknown>;
  timesTriggered: number;
  lastTriggeredAt: string | null;
  actions: Action[];
};

type Tag = { id: string; name: string; color: string | null };
type Template = { id: string; name: string; subject: string; htmlBody: string; category: string };
type FunnelStep = { id: string; name: string; type: string };
type Funnel = { id: string; name: string; steps: FunnelStep[] };
type Sequence = { id: string; name: string; status: string };
type SenderIdentity = { id: string; name: string; email: string; isDefault: boolean };

type CardId = "trigger" | number;

const inputCls = "w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-300 transition-colors";

const TRIGGERS: { type: TriggerType; label: string; Icon: typeof Zap; description: string }[] = [
  { type: "NEW_SALE",                    label: "New sale",                    Icon: ShoppingCart,      description: "Fires when a customer completes a purchase." },
  { type: "SALE_CANCELED",               label: "Sale canceled",               Icon: Undo2,             description: "Fires when a one-time order is fully refunded or a subscription is canceled." },
  { type: "SUBSCRIPTION_PAYMENT_FAILED", label: "Subscription payment failed", Icon: AlertTriangle,     description: "Fires when a subscription renewal payment fails (status becomes past due)." },
  { type: "FORM_SUBMIT",                 label: "Form submitted",              Icon: FormInput,         description: "Fires when a contact submits an opt-in form." },
  { type: "TAG_ADDED",                   label: "Tag added",                   Icon: TagIcon,           description: "Fires when a specific tag is added to a contact." },
  { type: "TAG_REMOVED",                 label: "Tag removed",                 Icon: TagIcon,           description: "Fires when a specific tag is removed from a contact." },
  { type: "EMAIL_LINK_CLICKED",          label: "Email link clicked",          Icon: MousePointerClick, description: "Fires when a contact clicks a link in an email (Phase 3)." },
];

const ACTIONS: { type: ActionType; label: string; Icon: typeof Zap; description: string }[] = [
  { type: "SEND_EMAIL",     label: "Send email",     Icon: Mail,     description: "Send a personalized email to the contact." },
  { type: "ADD_TAG",        label: "Add tag",        Icon: TagIcon,  description: "Tag the contact for later segmentation." },
  { type: "REMOVE_TAG",     label: "Remove tag",     Icon: TagIcon,  description: "Remove a tag from the contact." },
  { type: "WEBHOOK",        label: "Send webhook",   Icon: Webhook,  description: "POST trigger data to an external URL." },
  { type: "START_SEQUENCE", label: "Start sequence", Icon: Repeat,   description: "Enroll the contact in an email drip sequence." },
  { type: "END_SEQUENCE",   label: "End sequence",   Icon: Repeat,   description: "Remove the contact from a sequence (or all sequences)." },
];

// ─── Summary helpers ─────────────────────────────────────────────────────────
// Generate a 1-line human-readable description of trigger / action for the
// collapsed card view.

function triggerSummary(
  triggerType: TriggerType,
  config: Record<string, unknown>,
  tags: Tag[],
  funnels: Funnel[],
): string {
  const trig = TRIGGERS.find((t) => t.type === triggerType);
  if (!trig) return "Configure trigger";

  const parts: string[] = [trig.label];

  if (
    triggerType === "NEW_SALE" ||
    triggerType === "SALE_CANCELED" ||
    triggerType === "SUBSCRIPTION_PAYMENT_FAILED" ||
    triggerType === "FORM_SUBMIT"
  ) {
    const funnel = funnels.find((f) => f.id === config.funnelId);
    const step = funnel?.steps.find((s) => s.id === config.funnelStepId);
    if (step)        parts.push(`on step "${step.name}"`);
    else if (funnel) parts.push(`in funnel "${funnel.name}"`);
  } else if (triggerType === "TAG_ADDED" || triggerType === "TAG_REMOVED") {
    const tag = tags.find((t) => t.id === config.tagId);
    if (tag) parts.push(`"${tag.name}"`);
    else     parts.push("(any tag)");
  }

  return parts.join(" · ");
}

function actionSummary(action: Action, tags: Tag[], sequences: Sequence[]): string {
  switch (action.actionType) {
    case "SEND_EMAIL":
      return action.emailSubject?.trim()
        ? `"${truncate(action.emailSubject, 50)}"`
        : "(no subject yet)";
    case "ADD_TAG": {
      const tag = tags.find((t) => t.id === action.actionConfig?.tagId);
      return tag ? `Add "${tag.name}"` : "(select a tag)";
    }
    case "REMOVE_TAG": {
      const tag = tags.find((t) => t.id === action.actionConfig?.tagId);
      return tag ? `Remove "${tag.name}"` : "(select a tag)";
    }
    case "WEBHOOK": {
      const url = action.actionConfig?.url as string | undefined;
      if (!url) return "(no URL set)";
      try {
        return new URL(url).host;
      } catch {
        return truncate(url, 40);
      }
    }
    case "START_SEQUENCE": {
      const seq = sequences.find((s) => s.id === action.actionConfig?.sequenceId);
      if (!seq) return "(select a sequence)";
      return seq.status === "ACTIVE" ? `"${truncate(seq.name, 40)}"` : `"${truncate(seq.name, 40)}" (${seq.status.toLowerCase()})`;
    }
    case "END_SEQUENCE": {
      const sequenceId = action.actionConfig?.sequenceId as string | undefined;
      if (!sequenceId) return "(select a sequence)";
      if (sequenceId === "*") return "All sequences";
      const seq = sequences.find((s) => s.id === sequenceId);
      return seq ? `"${truncate(seq.name, 40)}"` : "(sequence not found)";
    }
    default:
      return "";
  }
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function AutomationBuilder({
  initial, tags, templates, funnels, sequences = [], senderIdentities = [],
}: {
  initial: Initial;
  tags: Tag[];
  templates: Template[];
  funnels: Funnel[];
  sequences?: Sequence[];
  senderIdentities?: SenderIdentity[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  // Content edits (action config, email subject/body/sender, tag pick, URL,
  // sequence pick) are always allowed. Structural changes (add/remove/reorder
  // actions, change trigger, swap action type) are blocked when ACTIVE
  // because in-flight runs operate against the saved action snapshot —
  // restructuring mid-run could send duplicates or skip steps. Server enforces
  // the same rule.
  const structuralLocked = initial.status === "ACTIVE";

  const [name, setName] = useState(initial.name);
  const [status, setStatus] = useState<Status>(initial.status);
  const [triggerType, setTriggerType] = useState<TriggerType>(initial.triggerType);
  const [triggerConfig, setTriggerConfig] = useState<Record<string, unknown>>(initial.triggerConfig);
  const [actions, setActions] = useState<Action[]>(initial.actions);
  const [save, setSave] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [showRuns, setShowRuns] = useState(false);
  const [toggling, setToggling] = useState(false);

  // Open card management — only one card expanded at a time
  // For brand-new automations, auto-open the trigger card so the user has a starting point.
  const [openCardId, setOpenCardId] = useState<CardId | null>(() => {
    if (initial.actions.length === 0) return "trigger";
    return null;
  });

  function openCard(id: CardId) {
    setOpenCardId(id);
  }

  function closeCard() {
    setOpenCardId(null);
  }

  const dirty = useMemo(() => {
    if (name !== initial.name) return true;
    if (triggerType !== initial.triggerType) return true;
    if (JSON.stringify(triggerConfig) !== JSON.stringify(initial.triggerConfig)) return true;
    if (JSON.stringify(actions) !== JSON.stringify(initial.actions)) return true;
    return false;
  }, [name, triggerType, triggerConfig, actions, initial]);

  // Validation runs on every edit — drives field highlights, warning banner,
  // and the disabled state of the Activate button.
  const validation = useMemo(
    () => validateAutomation({ triggerType, triggerConfig, actions, tags, funnels }),
    [triggerType, triggerConfig, actions, tags, funnels],
  );

  const triggerIssues = useMemo(
    () => [...validation.errors, ...validation.warnings].filter((i) => i.cardId === "trigger"),
    [validation],
  );

  const issuesByActionIdx = useMemo(() => {
    const map = new Map<number, ValidationIssue[]>();
    for (const issue of [...validation.errors, ...validation.warnings]) {
      if (typeof issue.cardId === "number") {
        const arr = map.get(issue.cardId) ?? [];
        arr.push(issue);
        map.set(issue.cardId, arr);
      }
    }
    return map;
  }, [validation]);

  const hasErrors = validation.errors.length > 0;

  const handleSave = useCallback(async () => {
    setSave("saving"); setSaveErr(null);
    const res = await fetch(`/api/automations/${initial.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        triggerType,
        triggerConfig,
        actions: actions.map((a) => ({
          id: a.id,
          actionType: a.actionType,
          actionConfig: a.actionConfig,
          emailTemplateId: a.emailTemplateId,
          emailSubject: a.emailSubject,
          emailHtmlBody: a.emailHtmlBody,
          emailFromName: a.emailFromName,
          emailFromEmail: a.emailFromEmail,
        })),
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
  }, [initial.id, name, triggerType, triggerConfig, actions, router]);

  // Cmd+S
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty && save !== "saving") handleSave();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [dirty, save, handleSave]);

  async function toggleStatus() {
    if (status === "DRAFT" && actions.length === 0) {
      toast.warning("Add at least one action before activating.");
      return;
    }
    const next: Status = status === "ACTIVE" ? "PAUSED" : "ACTIVE";

    // Block activation if there are validation errors. Pause is always allowed.
    if (next === "ACTIVE" && hasErrors) {
      toast.warning(`Cannot activate — ${validation.errors.length} error(s) need to be fixed first.`);
      // Auto-open the first card with an error to guide the user
      const firstError = validation.errors[0];
      setOpenCardId(firstError.cardId);
      return;
    }

    const ok = await confirm(
      next === "ACTIVE"
        ? {
            title: "Activate this automation?",
            description:
              "It will start firing on matching trigger events immediately. Existing contacts who already match the trigger condition won't be retroactively run.",
            confirmLabel: "Activate",
            variant: "default",
          }
        : {
            title: "Pause this automation?",
            description:
              "It will stop responding to triggers until you activate again. In-flight runs already in progress will finish.",
            confirmLabel: "Pause",
            variant: "warning",
          }
    );
    if (!ok) return;

    setToggling(true);
    try {
      if (dirty) await handleSave();

      const res = await fetch(`/api/automations/${initial.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const json = await res.json();
      if (!json.success) { toast.error(json.error ?? "Failed to update status"); return; }
      setStatus(next);
      toast.success(next === "ACTIVE" ? "Automation activated" : "Automation paused");
      router.refresh();
    } finally {
      setToggling(false);
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: "Delete automation?",
      description: `"${initial.name}" and all its run history will be removed.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    const res = await fetch(`/api/automations/${initial.id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.success) router.push("/automations");
  }

  function addAction(type: ActionType) {
    const newIdx = actions.length;
    const newAction: Action = {
      order: newIdx,
      actionType: type,
      actionConfig: {},
      emailTemplateId: null,
      emailSubject: type === "SEND_EMAIL" ? "Subject line" : null,
      emailHtmlBody: type === "SEND_EMAIL" ? WELCOME_EMAIL_DOC : null,
      emailFromName: null,
      emailFromEmail: null,
    };
    setActions([...actions, newAction]);
    // Auto-expand the newly added action so user can immediately configure it
    setOpenCardId(newIdx);
  }

  function updateAction(idx: number, patch: Partial<Action>) {
    setActions((prev) => prev.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  }

  function removeAction(idx: number) {
    setActions((prev) => prev.filter((_, i) => i !== idx).map((a, i) => ({ ...a, order: i })));
    if (openCardId === idx) setOpenCardId(null);
  }

  function moveAction(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    if (next < 0 || next >= actions.length) return;
    const arr = [...actions];
    [arr[idx], arr[next]] = [arr[next], arr[idx]];
    setActions(arr.map((a, i) => ({ ...a, order: i })));
    // Keep the moved card expanded if it was
    if (openCardId === idx) setOpenCardId(next);
    else if (openCardId === next) setOpenCardId(idx);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-gray-200 bg-white shrink-0">
        <Link
          href="/automations"
          className="p-1.5 -ml-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Automation name"
            className="text-sm font-medium text-gray-900 bg-transparent border border-transparent hover:border-gray-200 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:outline-none rounded-lg px-2 py-1 -mx-2 -my-1 w-full max-w-md transition-all"
          />
          <StatusBadge status={status} />
        </div>

        <button
          onClick={() => setShowRuns((s) => !s)}
          className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            showRuns
              ? "bg-blue-50 text-blue-700 border border-blue-200"
              : "text-gray-600 hover:bg-gray-100 border border-transparent"
          }`}
          title="Run history"
        >
          <History size={12} /> History
        </button>

        <button
          onClick={handleSave}
          disabled={!dirty || save === "saving"}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg transition-colors"
        >
          {save === "saving" ? <Loader2 size={12} className="animate-spin" />
            : save === "saved" ? <Check size={12} /> : <Save size={12} />}
          {save === "saved" ? "Saved" : "Save"}
        </button>

        {actions.length > 0 && (
          <button
            onClick={toggleStatus}
            disabled={toggling || (status !== "ACTIVE" && hasErrors)}
            title={status !== "ACTIVE" && hasErrors ? `Fix ${validation.errors.length} error(s) first` : undefined}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              status === "ACTIVE"
                ? "text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200"
                : "text-white bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {toggling
              ? <><Loader2 size={12} className="animate-spin" /> {status === "ACTIVE" ? "Pausing…" : "Activating…"}</>
              : status === "ACTIVE"
                ? <><Pause size={12} /> Pause</>
                : <><Play size={12} /> Activate</>}
          </button>
        )}

        <button
          onClick={handleDelete}
          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Save error */}
      {saveErr && (
        <div className="px-4 sm:px-6 py-2 bg-red-50 border-b border-red-200 text-sm text-red-700 flex items-center gap-2 shrink-0">
          <AlertCircle size={14} /> {saveErr}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-3">
          {/* Active-automation notice — content edits OK, structural needs pause */}
          {structuralLocked && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800">
              <AlertCircle size={13} className="mt-0.5 shrink-0 text-blue-600" />
              <span>
                <span className="font-medium">Active automation.</span>{" "}
                Content edits (action config, email, tag, URL) apply to the next firing. Pause to change the trigger or add/remove actions.
              </span>
            </div>
          )}

          {/* Trigger card — locked when ACTIVE (changing trigger mid-flight is unsafe) */}
          <TriggerCard
            triggerType={triggerType}
            setTriggerType={setTriggerType}
            triggerConfig={triggerConfig}
            setTriggerConfig={setTriggerConfig}
            tags={tags}
            funnels={funnels}
            disabled={structuralLocked}
            expanded={openCardId === "trigger"}
            onToggle={() => openCardId === "trigger" ? closeCard() : openCard("trigger")}
            issues={triggerIssues}
          />

          {/* Action cards */}
          {actions.map((action, idx) => (
            <div key={idx}>
              <FlowArrow />
              <ActionCard
                action={action}
                index={idx}
                total={actions.length}
                onChange={(patch) => updateAction(idx, patch)}
                onMoveUp={() => moveAction(idx, -1)}
                onMoveDown={() => moveAction(idx, 1)}
                onRemove={() => removeAction(idx)}
                tags={tags}
                templates={templates}
                sequences={sequences}
                senderIdentities={senderIdentities}
                structuralLocked={structuralLocked}
                expanded={openCardId === idx}
                onToggle={() => openCardId === idx ? closeCard() : openCard(idx)}
                issues={issuesByActionIdx.get(idx) ?? []}
              />
            </div>
          ))}

          {/* Add action — hidden when structurally locked */}
          {!structuralLocked && (
            <>
              <FlowArrow />
              <AddActionPalette onAdd={addAction} />
            </>
          )}

          {/* Stats */}
          {initial.timesTriggered > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 text-sm text-gray-600 mt-4">
              Triggered <strong>{initial.timesTriggered.toLocaleString()}</strong> time{initial.timesTriggered !== 1 ? "s" : ""}
              {initial.lastTriggeredAt && (
                <> · last on {new Date(initial.lastTriggeredAt).toLocaleString()}</>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Run history drawer */}
      {showRuns && <RunHistoryDrawer automationId={initial.id} onClose={() => setShowRuns(false)} />}
    </div>
  );
}

// ─── Card chrome — outer shell shared by Trigger/Action cards ────────────────

function CardShell({
  ringColor, badge, badgeColor, icon, title, summary,
  expanded, onToggle, disabled, headerExtras, issues, children,
}: {
  ringColor: string;
  badge: string;
  badgeColor: string;
  icon: React.ReactNode;
  title: string;
  summary: string;
  expanded: boolean;
  onToggle: () => void;
  disabled: boolean;
  headerExtras?: React.ReactNode;
  issues?: ValidationIssue[];
  children: React.ReactNode;
}) {
  const hasError = (issues ?? []).some((i) => i.severity === "error");
  const hasWarn  = (issues ?? []).some((i) => i.severity === "warning");
  // Border priority: error > warning > expanded ring > default
  const borderCls = hasError
    ? "border-2 border-red-300"
    : hasWarn
      ? "border-2 border-amber-300"
      : expanded
        ? `border-2 ${ringColor} shadow-sm`
        : "border border-gray-200 hover:border-gray-300";

  // Use a div+role="button" instead of <button> because the header may contain
  // nested action buttons (move up/down, delete) which is invalid HTML inside
  // a real button element.
  return (
    <div className={`bg-white rounded-xl transition-all ${borderCls}`}>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded-xl"
        aria-expanded={expanded}
      >
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${badgeColor}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">{badge}</p>
          <p className="text-sm font-medium text-gray-900 truncate">{title}</p>
          {!expanded && (
            <p className="text-xs text-gray-500 truncate mt-0.5">{summary}</p>
          )}
        </div>
        {(hasError || hasWarn) && !expanded && (
          <span
            className={`flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded shrink-0 ${
              hasError ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
            }`}
            title={hasError ? "Has errors" : "Has warnings"}
          >
            <AlertCircle size={10} />
            {(issues ?? []).length}
          </span>
        )}
        {headerExtras}
        {!disabled && (
          <span className="p-1.5 text-gray-400 shrink-0">
            {expanded ? <ChevronUp size={16} /> : <Pencil size={14} />}
          </span>
        )}
      </div>

      {/* Body — only rendered when expanded */}
      {expanded && (
        <div className="px-4 sm:px-5 pb-5 pt-1 border-t border-gray-100">
          {/* Per-card issue list at top of expanded body */}
          {(issues ?? []).filter((i) => !i.field).length > 0 && (
            <div className="mt-3 space-y-1.5">
              {(issues ?? []).filter((i) => !i.field).map((issue, i) => (
                <IssueLine key={i} issue={issue} />
              ))}
            </div>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

function IssueLine({ issue }: { issue: ValidationIssue }) {
  const isErr = issue.severity === "error";
  return (
    <div
      className={`flex items-start gap-2 px-3 py-2 text-xs rounded-lg ${
        isErr ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"
      }`}
    >
      <AlertCircle size={12} className="mt-0.5 shrink-0" />
      <span>{issue.message}</span>
    </div>
  );
}

function FieldError({ issues, field }: { issues?: ValidationIssue[]; field: string }) {
  const issue = (issues ?? []).find((i) => i.field === field);
  if (!issue) return null;
  return (
    <p
      className={`mt-1 text-xs flex items-center gap-1 ${
        issue.severity === "error" ? "text-red-600" : "text-amber-700"
      }`}
    >
      <AlertCircle size={10} /> {issue.message}
    </p>
  );
}

function fieldHasError(issues: ValidationIssue[] | undefined, field: string): boolean {
  return (issues ?? []).some((i) => i.field === field && i.severity === "error");
}

// ─── Trigger card ────────────────────────────────────────────────────────────

function TriggerCard({
  triggerType, setTriggerType, triggerConfig, setTriggerConfig,
  tags, funnels, disabled, expanded, onToggle, issues,
}: {
  triggerType: TriggerType;
  setTriggerType: (t: TriggerType) => void;
  triggerConfig: Record<string, unknown>;
  setTriggerConfig: (c: Record<string, unknown>) => void;
  tags: Tag[];
  funnels: Funnel[];
  disabled: boolean;
  expanded: boolean;
  onToggle: () => void;
  issues?: ValidationIssue[];
}) {
  const trig = TRIGGERS.find((t) => t.type === triggerType)!;
  const TrigIcon = trig.Icon;

  const selectedFunnelId = (triggerConfig.funnelId as string) ?? "";
  const selectedFunnel = funnels.find((f) => f.id === selectedFunnelId);
  const optinSteps = selectedFunnel?.steps.filter((s) => s.type === "OPTIN") ?? [];
  // NEW_SALE only fires on payment-processing steps. Renting it to SALES or
  // THANKYOU pages would never fire (no payment event there). UPSELL/DOWNSELL
  // exist in the schema but aren't user-supported yet — CHECKOUT only.
  const saleSteps = selectedFunnel?.steps.filter((s) => s.type === "CHECKOUT") ?? [];

  const summary = triggerSummary(triggerType, triggerConfig, tags, funnels);

  return (
    <CardShell
      ringColor="border-blue-300"
      badge="When"
      badgeColor="bg-blue-50 text-blue-600"
      icon={<TrigIcon size={16} />}
      title={trig.label}
      summary={summary}
      expanded={expanded}
      onToggle={onToggle}
      disabled={disabled}
      issues={issues}
    >
      <div className="space-y-3 pt-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Event</label>
          <select
            value={triggerType}
            onChange={(e) => { setTriggerType(e.target.value as TriggerType); setTriggerConfig({}); }}
            disabled={disabled}
            className={inputCls}
          >
            {TRIGGERS.map((t) => (
              <option key={t.type} value={t.type}>{t.label}</option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-gray-400">{trig.description}</p>
        </div>

        {(triggerType === "TAG_ADDED" || triggerType === "TAG_REMOVED") && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">For tag</label>
            <select
              value={(triggerConfig.tagId as string) ?? ""}
              onChange={(e) =>
                setTriggerConfig({ ...triggerConfig, tagId: e.target.value || undefined })
              }
              disabled={disabled}
              className={inputCls}
            >
              <option value="">— Any tag —</option>
              {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <FieldError issues={issues} field="tagId" />
          </div>
        )}

        {(triggerType === "NEW_SALE" || triggerType === "SALE_CANCELED" || triggerType === "SUBSCRIPTION_PAYMENT_FAILED") && (
          <>
            {funnels.length === 0 ? (
              <p className="text-xs text-amber-600">
                You need a funnel with a checkout step before this trigger can fire.{" "}
                <Link href="/funnels" className="underline">Create one →</Link>
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">
                    Funnel <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedFunnelId}
                    onChange={(e) => {
                      const v = e.target.value;
                      setTriggerConfig({ ...triggerConfig, funnelId: v || undefined, funnelStepId: undefined });
                    }}
                    disabled={disabled}
                    className={inputCls}
                  >
                    <option value="">— Choose a funnel —</option>
                    {funnels.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                  <FieldError issues={issues} field="funnelId" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">
                    Step <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={(triggerConfig.funnelStepId as string) ?? ""}
                    onChange={(e) =>
                      setTriggerConfig({ ...triggerConfig, funnelStepId: e.target.value || undefined })
                    }
                    disabled={disabled || !selectedFunnel || saleSteps.length === 0}
                    className={inputCls}
                  >
                    <option value="">— Choose a step —</option>
                    {saleSteps.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.type.toLowerCase()})</option>
                    ))}
                  </select>
                  {selectedFunnel && saleSteps.length === 0 && (
                    <p className="mt-1 text-xs text-amber-600">This funnel has no checkout/upsell/downsell steps.</p>
                  )}
                  <FieldError issues={issues} field="funnelStepId" />
                </div>
              </div>
            )}
          </>
        )}

        {triggerType === "FORM_SUBMIT" && (
          <>
            {funnels.length === 0 ? (
              <p className="text-xs text-amber-600">
                You need a funnel with an opt-in step before this trigger can fire.{" "}
                <Link href="/funnels" className="underline">Create one →</Link>
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">
                    Funnel <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedFunnelId}
                    onChange={(e) => {
                      const v = e.target.value;
                      setTriggerConfig({ ...triggerConfig, funnelId: v || undefined, funnelStepId: undefined });
                    }}
                    disabled={disabled}
                    className={inputCls}
                  >
                    <option value="">— Choose a funnel —</option>
                    {funnels.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                  <FieldError issues={issues} field="funnelId" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">
                    Opt-in step <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={(triggerConfig.funnelStepId as string) ?? ""}
                    onChange={(e) =>
                      setTriggerConfig({ ...triggerConfig, funnelStepId: e.target.value || undefined })
                    }
                    disabled={disabled || !selectedFunnel || optinSteps.length === 0}
                    className={inputCls}
                  >
                    <option value="">— Choose a step —</option>
                    {optinSteps.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  {selectedFunnel && optinSteps.length === 0 && (
                    <p className="mt-1 text-xs text-amber-600">This funnel has no opt-in steps.</p>
                  )}
                  <FieldError issues={issues} field="funnelStepId" />
                </div>
              </div>
            )}
          </>
        )}

        {!disabled && (
          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={onToggle}
              className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </CardShell>
  );
}

// ─── Action card ─────────────────────────────────────────────────────────────

function ActionCard({
  action, index, total, onChange, onMoveUp, onMoveDown, onRemove,
  tags, templates, sequences, senderIdentities, structuralLocked, expanded, onToggle, issues,
}: {
  action: Action;
  index: number;
  total: number;
  onChange: (patch: Partial<Action>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  tags: Tag[];
  templates: Template[];
  sequences: Sequence[];
  senderIdentities: SenderIdentity[];
  structuralLocked: boolean;
  expanded: boolean;
  onToggle: () => void;
  issues?: ValidationIssue[];
}) {
  const meta = ACTIONS.find((a) => a.type === action.actionType) ?? ACTIONS[0];
  const Icon = meta.Icon;
  const [composeOpen, setComposeOpen] = useState(false);

  // Per-field errors for the compose button — extract from validation issues.
  const subjectIssue = (issues ?? []).find((i) => i.field === "emailSubject");
  const bodyIssue    = (issues ?? []).find((i) => i.field === "emailHtmlBody");

  // Header reorder/delete buttons — hidden when structurally locked (ACTIVE)
  const headerExtras = expanded && !structuralLocked ? (
    <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={onMoveUp}
        disabled={index === 0}
        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title="Move up"
      >
        <ChevronUp size={14} />
      </button>
      <button
        type="button"
        onClick={onMoveDown}
        disabled={index === total - 1}
        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title="Move down"
      >
        <ChevronDown size={14} />
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        title="Remove"
      >
        <Trash2 size={14} />
      </button>
    </div>
  ) : null;

  return (
    <CardShell
      ringColor="border-emerald-300"
      badge={`Then · Step ${index + 1}`}
      badgeColor="bg-emerald-50 text-emerald-600"
      icon={<Icon size={16} />}
      title={meta.label}
      summary={actionSummary(action, tags, sequences)}
      expanded={expanded}
      onToggle={onToggle}
      disabled={false}
      headerExtras={headerExtras}
      issues={issues}
    >
      <div className="space-y-3 pt-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Action type</label>
          <select
            value={action.actionType}
            onChange={(e) => {
              const newType = e.target.value as ActionType;
              onChange({
                actionType: newType,
                actionConfig: {},
                emailTemplateId: null,
                emailSubject: newType === "SEND_EMAIL" ? "Subject line" : null,
                emailHtmlBody: newType === "SEND_EMAIL" ? "<p>Hi {{contact.firstName}},</p><p>...</p>" : null,
              });
            }}
            disabled={structuralLocked}
            className={inputCls}
          >
            {ACTIONS.map((a) => (
              <option key={a.type} value={a.type}>{a.label}</option>
            ))}
          </select>
        </div>

        {(action.actionType === "ADD_TAG" || action.actionType === "REMOVE_TAG") && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              {action.actionType === "ADD_TAG" ? "Tag to add" : "Tag to remove"}
            </label>
            <select
              value={(action.actionConfig.tagId as string) ?? ""}
              onChange={(e) => onChange({ actionConfig: { ...action.actionConfig, tagId: e.target.value } })}
              className={fieldHasError(issues, "tagId") ? `${inputCls} border-red-300` : inputCls}
            >
              <option value="">— Select tag —</option>
              {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <FieldError issues={issues} field="tagId" />
          </div>
        )}

        {action.actionType === "WEBHOOK" && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Webhook URL</label>
              <input
                type="url"
                value={(action.actionConfig.url as string) ?? ""}
                onChange={(e) => onChange({ actionConfig: { ...action.actionConfig, url: e.target.value } })}
                placeholder="https://hooks.slack.com/..."
                className={fieldHasError(issues, "url") ? `${inputCls} border-red-300` : inputCls}
              />
              <FieldError issues={issues} field="url" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">HTTP Method</label>
              <select
                value={(action.actionConfig.method as string) ?? "POST"}
                onChange={(e) => onChange({ actionConfig: { ...action.actionConfig, method: e.target.value } })}
                className={inputCls}
              >
                <option value="POST">POST</option>
                <option value="GET">GET</option>
                <option value="PUT">PUT</option>
              </select>
            </div>
          </>
        )}

        {action.actionType === "START_SEQUENCE" && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Sequence to enroll the contact in</label>
            <select
              value={(action.actionConfig.sequenceId as string) ?? ""}
              onChange={(e) => onChange({ actionConfig: { ...action.actionConfig, sequenceId: e.target.value } })}
              className={inputCls}
            >
              <option value="">— Select sequence —</option>
              {sequences.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.status !== "ACTIVE" ? ` (${s.status.toLowerCase()})` : ""}
                </option>
              ))}
            </select>
            {sequences.length === 0 && (
              <p className="mt-1.5 text-xs text-amber-600">
                No sequences yet. <Link href="/sequences" className="underline">Create one</Link> first.
              </p>
            )}
            <p className="mt-1.5 text-xs text-gray-400">
              The contact must already exist (have an email). Already-enrolled contacts are skipped.
            </p>
          </div>
        )}

        {action.actionType === "END_SEQUENCE" && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Sequence to remove the contact from</label>
            <select
              value={(action.actionConfig.sequenceId as string) ?? ""}
              onChange={(e) => onChange({ actionConfig: { ...action.actionConfig, sequenceId: e.target.value } })}
              className={inputCls}
            >
              <option value="">— Select sequence —</option>
              <option value="*">All sequences</option>
              {sequences.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.status !== "ACTIVE" ? ` (${s.status.toLowerCase()})` : ""}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-gray-400">
              No-op if the contact isn't currently enrolled. Use "All sequences" for a global opt-out.
            </p>
          </div>
        )}

        {action.actionType === "SEND_EMAIL" && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1.5">Email content</p>
            <EmailComposeButton
              subject={action.emailSubject ?? ""}
              htmlBody={action.emailHtmlBody ?? ""}
              onClick={() => setComposeOpen(true)}
              errors={{
                subject: subjectIssue?.message,
                body: bodyIssue?.message,
              }}
            />
          </div>
        )}

        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={onToggle}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>

      {/* Compose drawer for SEND_EMAIL — content always editable */}
      {action.actionType === "SEND_EMAIL" && (
        <EmailComposeDrawer
          open={composeOpen}
          onClose={() => setComposeOpen(false)}
          title={`Step ${index + 1} email`}
          subtitle={`Action ${index + 1} of ${total}`}
          subject={action.emailSubject ?? ""}
          htmlBody={action.emailHtmlBody ?? ""}
          currentTemplateId={action.emailTemplateId}
          fromEmail={action.emailFromEmail}
          fromName={action.emailFromName}
          onChange={(patch) => onChange({
            ...(patch.subject !== undefined ? { emailSubject: patch.subject } : {}),
            ...(patch.htmlBody !== undefined ? { emailHtmlBody: patch.htmlBody } : {}),
            ...(patch.templateId !== undefined ? { emailTemplateId: patch.templateId } : {}),
            ...(patch.fromEmail !== undefined ? { emailFromEmail: patch.fromEmail } : {}),
            ...(patch.fromName !== undefined ? { emailFromName: patch.fromName } : {}),
          })}
          templates={templates}
          senderIdentities={senderIdentities}
          errors={{
            subject: subjectIssue?.message,
            body: bodyIssue?.message,
          }}
        />
      )}
    </CardShell>
  );
}

// ─── Add-action palette ──────────────────────────────────────────────────────

function AddActionPalette({ onAdd }: { onAdd: (type: ActionType) => void }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 hover:border-blue-300 text-gray-500 hover:text-blue-600 rounded-xl transition-colors text-sm font-medium"
      >
        <Plus size={14} /> Add action
      </button>
    );
  }
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2 px-1">
        <p className="text-xs font-medium text-gray-500">Pick an action</p>
        <button
          onClick={() => setOpen(false)}
          className="p-1 text-gray-400 hover:text-gray-600 rounded"
        >
          <X size={12} />
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {ACTIONS.map((a) => (
          <button
            key={a.type}
            onClick={() => { onAdd(a.type); setOpen(false); }}
            className="flex flex-col items-center gap-1.5 p-3 bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50 rounded-xl transition-colors text-center group"
          >
            <a.Icon size={18} className="text-gray-600 group-hover:text-blue-600" />
            <span className="text-xs font-medium text-gray-700 group-hover:text-blue-700">{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Misc ────────────────────────────────────────────────────────────────────

function FlowArrow() {
  return (
    <div className="flex justify-center">
      <div className="w-px h-5 bg-gray-300" />
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, string> = {
    DRAFT:  "bg-gray-100 text-gray-600",
    ACTIVE: "bg-emerald-50 text-emerald-700",
    PAUSED: "bg-amber-50 text-amber-700",
  };
  return (
    <span className={`text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded ${map[status]} shrink-0`}>
      {status.toLowerCase()}
    </span>
  );
}

// ─── Run history drawer ─────────────────────────────────────────────────────

function RunHistoryDrawer({ automationId, onClose }: { automationId: string; onClose: () => void }) {
  const [runs, setRuns] = useState<any[] | null>(null);

  useEffect(() => {
    fetch(`/api/automations/${automationId}/runs?limit=50`)
      .then((r) => r.json())
      .then((j) => { if (j.success) setRuns(j.data); });
  }, [automationId]);

  return (
    <div className="fixed inset-0 z-40 flex" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative ml-auto w-full max-w-md bg-white shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <History size={14} /> Run history
          </h3>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
            <X size={14} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {runs === null ? (
            <p className="text-xs text-gray-400">Loading…</p>
          ) : runs.length === 0 ? (
            <p className="text-xs text-gray-400">No runs yet.</p>
          ) : (
            <div className="space-y-2">
              {runs.map((r: any) => (
                <div key={r.id} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded ${
                      r.status === "COMPLETED" ? "bg-emerald-50 text-emerald-700"
                      : r.status === "FAILED"   ? "bg-red-50 text-red-700"
                      :                            "bg-gray-100 text-gray-500"
                    }`}>
                      {r.status.toLowerCase()}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(r.startedAt).toLocaleString()}
                    </span>
                  </div>
                  {r.contact && (
                    <p className="text-xs text-gray-700 truncate">
                      {r.contact.email}
                    </p>
                  )}
                  {r.errorMessage && (
                    <p className="text-xs text-red-600 mt-1 break-words">{r.errorMessage}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
