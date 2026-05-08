"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Save, Loader2, Check, AlertCircle, Trash2, Play, Pause,
  Plus, Mail, Clock, ChevronUp, ChevronDown, Pencil, X, Users,
  ShieldCheck, UserPlus, Tag as TagIcon, Search,
} from "lucide-react";
import { WELCOME_EMAIL_DOC, isEmptyEmailDoc } from "@launchtic/email";
import { useConfirm } from "../ui/ConfirmDialog";
import { useToast } from "../ui/Toast";
import { useUnsavedChanges } from "../../contexts/UnsavedChangesContext";
import EmailComposeDrawer, { EmailComposeButton } from "../emails/EmailComposeDrawer";

type Status = "DRAFT" | "ACTIVE" | "PAUSED";

type Step = {
  id?: string;
  order: number;
  delayMinutes: number;
  emailTemplateId: string | null;
  emailSubject: string;
  emailHtmlBody: string;
  emailFromName: string | null;
  emailFromEmail: string | null;
};

type Initial = {
  id: string;
  name: string;
  status: Status;
  totalEnrolled: number;
  activeCount: number;
  completedCount: number;
  exitedCount: number;
  steps: Step[];
};

type Template = { id: string; name: string; subject: string; htmlBody: string; category: string };
type SenderIdentity = { id: string; name: string; email: string; isDefault: boolean };

type CardId = number;

const inputCls = "w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-300 transition-colors";

// ─── Delay helpers — convert between minutes ↔ {days, hours, minutes} ────────

function splitDelay(totalMinutes: number): { days: number; hours: number; minutes: number } {
  const days = Math.floor(totalMinutes / (24 * 60));
  const remAfterDays = totalMinutes - days * 24 * 60;
  const hours = Math.floor(remAfterDays / 60);
  const minutes = remAfterDays - hours * 60;
  return { days, hours, minutes };
}

function combineDelay(days: number, hours: number, minutes: number): number {
  return Math.max(0, days * 24 * 60 + hours * 60 + minutes);
}

function formatDelay(totalMinutes: number): string {
  if (totalMinutes <= 0) return "Send immediately";
  const { days, hours, minutes } = splitDelay(totalMinutes);
  const parts: string[] = [];
  if (days > 0)    parts.push(`${days}d`);
  if (hours > 0)   parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  return `Wait ${parts.join(" ")}`;
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function SequenceBuilder({
  initial, templates, senderIdentities = [],
}: {
  initial: Initial;
  templates: Template[];
  senderIdentities?: SenderIdentity[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  // Content edits (subject/body/sender/delay) are always allowed. Structural
  // changes (add/remove/reorder steps) are blocked when ACTIVE because live
  // enrollments hold a `currentStepIndex` int into the step array — pause
  // first to add/remove. Server enforces the same rule.
  const structuralLocked = initial.status === "ACTIVE";

  const [name, setName] = useState(initial.name);
  const [status, setStatus] = useState<Status>(initial.status);
  const [steps, setSteps] = useState<Step[]>(initial.steps);
  const [save, setSave] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [showEnrollments, setShowEnrollments] = useState(false);
  const [toggling, setToggling] = useState(false);

  const [openCardId, setOpenCardId] = useState<CardId | null>(() => {
    if (initial.steps.length === 0) return 0;
    return null;
  });

  const dirty = useMemo(() => {
    if (name !== initial.name) return true;
    if (JSON.stringify(steps) !== JSON.stringify(initial.steps)) return true;
    return false;
  }, [name, steps, initial]);

  useUnsavedChanges(dirty);

  // Real-time validation — drives field highlights while editing. Empty-body
  // is intentionally checked only at activate time (see `findActivationBlocker`)
  // so users don't see "Body is empty" flashing the moment they clear the
  // editor; they get a single, focused message when they actually try to
  // activate.
  const stepIssues = useMemo(() => {
    const issues = new Map<number, string[]>();
    steps.forEach((s, idx) => {
      const errs: string[] = [];
      if (!s.emailSubject?.trim()) errs.push("Subject is required");
      if (s.delayMinutes < 0) errs.push("Delay must be ≥ 0");
      if (errs.length > 0) issues.set(idx, errs);
    });
    return issues;
  }, [steps]);

  // Computed once per change of `steps` — used by the Activate button (disabled
  // state) and the toggleStatus handler (jump to first blocking step).
  const activationBlocker = useMemo(() => {
    if (steps.length === 0) return { idx: -1, reason: "Add at least one step" };
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (!s.emailSubject?.trim()) return { idx: i, reason: `Step ${i + 1}: subject is required` };
      if (s.delayMinutes < 0)      return { idx: i, reason: `Step ${i + 1}: delay must be ≥ 0` };
      if (isEmptyEmailDoc(s.emailHtmlBody)) return { idx: i, reason: `Step ${i + 1}: email body is empty` };
    }
    return null;
  }, [steps]);

  const handleSave = useCallback(async () => {
    setSave("saving"); setSaveErr(null);
    const res = await fetch(`/api/sequences/${initial.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        steps: steps.map((s) => ({
          id: s.id,
          delayMinutes: s.delayMinutes,
          emailTemplateId: s.emailTemplateId,
          emailSubject: s.emailSubject,
          emailHtmlBody: s.emailHtmlBody,
          emailFromName: s.emailFromName,
          emailFromEmail: s.emailFromEmail,
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
  }, [initial.id, name, steps, router]);

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
    if (status === "DRAFT" && steps.length === 0) {
      toast.warning("Add at least one step before activating.");
      return;
    }
    const next: Status = status === "ACTIVE" ? "PAUSED" : "ACTIVE";

    if (next === "ACTIVE" && activationBlocker) {
      toast.warning(activationBlocker.reason);
      if (activationBlocker.idx >= 0) setOpenCardId(activationBlocker.idx);
      return;
    }

    const ok = await confirm(
      next === "ACTIVE"
        ? {
            title: "Activate this sequence?",
            description:
              "Existing enrollments resume sending and any new enrollments (manual or via automation) will start receiving emails on the next scheduler tick.",
            confirmLabel: "Activate",
            variant: "default",
          }
        : {
            title: "Pause this sequence?",
            description:
              "In-flight enrollments will be deferred — no emails sent until you activate again. You can edit content while paused.",
            confirmLabel: "Pause",
            variant: "warning",
          }
    );
    if (!ok) return;

    setToggling(true);
    try {
      if (dirty) await handleSave();

      const res = await fetch(`/api/sequences/${initial.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const json = await res.json();
      if (!json.success) { toast.error(json.error ?? "Failed to update status"); return; }
      setStatus(next);
      toast.success(next === "ACTIVE" ? "Sequence activated" : "Sequence paused");
      router.refresh();
    } finally {
      setToggling(false);
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: "Delete sequence?",
      description: `"${initial.name}" and all enrollments will be removed.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    const res = await fetch(`/api/sequences/${initial.id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.success) router.push("/sequences");
  }

  function addStep() {
    const newIdx = steps.length;
    const newStep: Step = {
      order: newIdx,
      delayMinutes: newIdx === 0 ? 0 : 60 * 24, // step 1 = immediate, others = 1 day
      emailTemplateId: null,
      emailSubject: "Subject line",
      emailHtmlBody: WELCOME_EMAIL_DOC,
      emailFromName: null,
      emailFromEmail: null,
    };
    setSteps([...steps, newStep]);
    setOpenCardId(newIdx);
  }

  function updateStep(idx: number, patch: Partial<Step>) {
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function removeStep(idx: number) {
    setSteps((prev) => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i })));
    if (openCardId === idx) setOpenCardId(null);
  }

  function moveStep(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    if (next < 0 || next >= steps.length) return;
    const arr = [...steps];
    [arr[idx], arr[next]] = [arr[next], arr[idx]];
    setSteps(arr.map((s, i) => ({ ...s, order: i })));
    if (openCardId === idx) setOpenCardId(next);
    else if (openCardId === next) setOpenCardId(idx);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-gray-200 bg-white shrink-0">
        <Link
          href="/sequences"
          className="p-1.5 -ml-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Sequence name"
            className="text-sm font-medium text-gray-900 bg-transparent border border-transparent hover:border-gray-200 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:outline-none rounded-lg px-2 py-1 -mx-2 -my-1 w-full max-w-md transition-all"
          />
          <StatusBadge status={status} />
        </div>

        <button
          onClick={() => setShowEnrollments((s) => !s)}
          className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            showEnrollments
              ? "bg-blue-50 text-blue-700 border border-blue-200"
              : "text-gray-600 hover:bg-gray-100 border border-transparent"
          }`}
          title="Live enrollments"
        >
          <Users size={12} /> Enrollments
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

        {steps.length > 0 && (
          <button
            onClick={toggleStatus}
            disabled={toggling || (status !== "ACTIVE" && !!activationBlocker)}
            title={status !== "ACTIVE" && activationBlocker ? activationBlocker.reason : undefined}
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

      {saveErr && (
        <div className="px-4 sm:px-6 py-2 bg-red-50 border-b border-red-200 text-sm text-red-700 flex items-center gap-2 shrink-0">
          <AlertCircle size={14} /> {saveErr}
        </div>
      )}

      {/* Stats strip */}
      {(initial.totalEnrolled > 0 || status === "ACTIVE") && (
        <div className="flex items-center gap-6 px-4 sm:px-6 py-2 border-b border-gray-100 bg-white shrink-0 text-xs text-gray-500">
          <span><strong className="text-gray-900">{initial.activeCount.toLocaleString()}</strong> active</span>
          <span><strong className="text-gray-900">{initial.completedCount.toLocaleString()}</strong> completed</span>
          <span><strong className="text-gray-900">{initial.exitedCount.toLocaleString()}</strong> exited</span>
          <span className="text-gray-400">·</span>
          <span>{initial.totalEnrolled.toLocaleString()} total enrolled</span>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-3">
          {/* Active-sequence notice — content edits OK, structural needs pause */}
          {structuralLocked && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800">
              <AlertCircle size={13} className="mt-0.5 shrink-0 text-blue-600" />
              <span>
                <span className="font-medium">Active sequence.</span>{" "}
                Content edits (subject, body, sender, delay) apply to future sends. Pause the sequence to add, remove, or reorder steps.
              </span>
            </div>
          )}

          {/* Step cards */}
          {steps.map((step, idx) => (
            <div key={idx}>
              {idx > 0 && <DelayArrow minutes={step.delayMinutes} />}
              <StepCard
                step={step}
                index={idx}
                total={steps.length}
                onChange={(patch) => updateStep(idx, patch)}
                onMoveUp={() => moveStep(idx, -1)}
                onMoveDown={() => moveStep(idx, 1)}
                onRemove={() => removeStep(idx)}
                templates={templates}
                senderIdentities={senderIdentities}
                structuralLocked={structuralLocked}
                expanded={openCardId === idx}
                onToggle={() => openCardId === idx ? setOpenCardId(null) : setOpenCardId(idx)}
                issues={stepIssues.get(idx)}
              />
            </div>
          ))}

          {/* Add step — hidden when structurally locked (sequence ACTIVE) */}
          {!structuralLocked && (
            <>
              {steps.length > 0 && <FlowArrow />}
              <button
                onClick={addStep}
                className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 hover:border-blue-300 text-gray-500 hover:text-blue-600 rounded-xl transition-colors text-sm font-medium"
              >
                <Plus size={14} /> Add step
              </button>
            </>
          )}
        </div>
      </div>

      {showEnrollments && (
        <EnrollmentsDrawer
          sequenceId={initial.id}
          sequenceStatus={status}
          onClose={() => setShowEnrollments(false)}
        />
      )}
    </div>
  );
}

// ─── Step card ───────────────────────────────────────────────────────────────

function StepCard({
  step, index, total, onChange, onMoveUp, onMoveDown, onRemove,
  templates, senderIdentities, structuralLocked, expanded, onToggle, issues,
}: {
  step: Step;
  index: number;
  total: number;
  onChange: (patch: Partial<Step>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  templates: Template[];
  senderIdentities: SenderIdentity[];
  structuralLocked: boolean;
  expanded: boolean;
  onToggle: () => void;
  issues?: string[];
}) {
  const [composeOpen, setComposeOpen] = useState(false);
  const { days, hours, minutes } = splitDelay(step.delayMinutes);

  // Per-field errors for the compose button — derive from string list.
  const subjectErr = issues?.find((i) => i.toLowerCase().includes("subject"));
  const bodyErr    = issues?.find((i) => i.toLowerCase().includes("body"));

  const hasErr = (issues?.length ?? 0) > 0;
  const borderCls = hasErr
    ? "border-2 border-red-300"
    : expanded
      ? "border-2 border-emerald-300 shadow-sm"
      : "border border-gray-200 hover:border-gray-300";

  const summary = step.emailSubject?.trim() ? `"${truncate(step.emailSubject, 50)}"` : "(no subject yet)";

  return (
    <div className={`bg-white rounded-xl transition-all ${borderCls}`}>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
        className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded-xl"
        aria-expanded={expanded}
      >
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-emerald-50 text-emerald-600">
          <Mail size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">
            Step {index + 1} · {formatDelay(step.delayMinutes)}
          </p>
          <p className="text-sm font-medium text-gray-900 truncate">{summary}</p>
        </div>
        {hasErr && !expanded && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded shrink-0 bg-red-50 text-red-700">
            <AlertCircle size={10} /> {issues!.length}
          </span>
        )}
        {expanded && !structuralLocked && (
          <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
            <button onClick={onMoveUp} disabled={index === 0}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Move up"><ChevronUp size={14} /></button>
            <button onClick={onMoveDown} disabled={index === total - 1}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Move down"><ChevronDown size={14} /></button>
            <button onClick={onRemove}
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Remove"><Trash2 size={14} /></button>
          </div>
        )}
        <span className="p-1.5 text-gray-400 shrink-0">
          {expanded ? <ChevronUp size={16} /> : <Pencil size={14} />}
        </span>
      </div>

      {expanded && (
        <div className="px-4 sm:px-5 pb-5 pt-1 border-t border-gray-100 space-y-3">
          {hasErr && (
            <div className="mt-3 space-y-1.5">
              {issues!.map((msg, i) => (
                <div key={i} className="flex items-start gap-2 px-3 py-2 text-xs rounded-lg bg-red-50 text-red-700">
                  <AlertCircle size={12} className="mt-0.5 shrink-0" />
                  <span>{msg}</span>
                </div>
              ))}
            </div>
          )}

          {/* Delay (hidden for step 1 — always sends immediately when enrolled) */}
          {index > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                Wait this long after the previous step
              </label>
              <div className="grid grid-cols-3 gap-2">
                <DelayInput label="Days" value={days}
                  onChange={(v) => onChange({ delayMinutes: combineDelay(v, hours, minutes) })} />
                <DelayInput label="Hours" value={hours} max={23}
                  onChange={(v) => onChange({ delayMinutes: combineDelay(days, v, minutes) })} />
                <DelayInput label="Minutes" value={minutes} max={59}
                  onChange={(v) => onChange({ delayMinutes: combineDelay(days, hours, v) })} />
              </div>
              <p className="mt-1.5 text-xs text-gray-400 flex items-center gap-1">
                <Clock size={10} /> {formatDelay(step.delayMinutes)} after step {index}
              </p>
            </div>
          )}
          {index === 0 && (
            <p className="text-xs text-gray-400 flex items-center gap-1">
              <Clock size={10} /> Step 1 is sent on the next scheduler tick (~within 1 min) after enroll.
            </p>
          )}

          {/* Email content — opens drawer (always editable; structural lock doesn't affect content) */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1.5">Email content</p>
            <EmailComposeButton
              subject={step.emailSubject}
              htmlBody={step.emailHtmlBody}
              onClick={() => setComposeOpen(true)}
              errors={{
                subject: subjectErr,
                body: bodyErr,
              }}
            />
          </div>

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
      )}

      {/* Compose drawer — always available (content edits allowed even when ACTIVE) */}
      <EmailComposeDrawer
          open={composeOpen}
          onClose={() => setComposeOpen(false)}
          title={`Step ${index + 1} email`}
          subtitle={index === 0 ? "Sent immediately on enroll" : `Sent ${formatDelay(step.delayMinutes).toLowerCase()} after the previous step`}
          subject={step.emailSubject}
          htmlBody={step.emailHtmlBody}
          currentTemplateId={step.emailTemplateId}
          fromEmail={step.emailFromEmail}
          fromName={step.emailFromName}
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
            subject: subjectErr,
            body: bodyErr,
          }}
        />
    </div>
  );
}

function DelayInput({
  label, value, max, onChange,
}: {
  label: string;
  value: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-1">{label}</label>
      <input
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(0, parseInt(e.target.value) || 0))}
        className={inputCls}
      />
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

function DelayArrow({ minutes }: { minutes: number }) {
  if (minutes <= 0) return <FlowArrow />;
  return (
    <div className="flex justify-center">
      <div className="flex items-center gap-1.5 px-2.5 py-1 my-1 text-[11px] text-gray-500 bg-gray-100 rounded-full">
        <Clock size={10} />
        {formatDelay(minutes)}
      </div>
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

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

// ─── Live enrollments drawer ─────────────────────────────────────────────────

type ContactHit = { id: string; email: string; firstName: string | null; lastName: string | null };
type TagOption  = { id: string; name: string };

function EnrollmentsDrawer({
  sequenceId,
  sequenceStatus,
  onClose,
}: {
  sequenceId: string;
  sequenceStatus: Status;
  onClose: () => void;
}) {
  const toast = useToast();
  const [items, setItems] = useState<any[] | null>(null);
  const [filter, setFilter] = useState<"" | "ACTIVE" | "COMPLETED" | "EXITED" | "FAILED">("");
  const [refreshTick, setRefreshTick] = useState(0); // bump to refetch enrollments after enroll

  useEffect(() => {
    const url = `/api/sequences/${sequenceId}/enrollments?limit=100${filter ? `&status=${filter}` : ""}`;
    fetch(url).then((r) => r.json()).then((j) => { if (j.success) setItems(j.data); });
  }, [sequenceId, filter, refreshTick]);

  function handleEnrolled() {
    setRefreshTick((t) => t + 1);
  }

  return (
    <div className="fixed inset-0 z-40 flex" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative ml-auto w-full max-w-md bg-white shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Users size={14} /> Enrollments
          </h3>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
            <X size={14} />
          </button>
        </div>

        {/* Enroll panel — only when sequence is ACTIVE; tag bulk needs an active scheduler */}
        <EnrollPanel
          sequenceId={sequenceId}
          sequenceStatus={sequenceStatus}
          onEnrolled={handleEnrolled}
          onError={(msg) => toast.error(msg)}
          onSuccess={(msg) => toast.success(msg)}
        />

        <div className="px-4 py-2 border-b border-gray-100 shrink-0">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className={inputCls}
          >
            <option value="">All</option>
            <option value="ACTIVE">Active</option>
            <option value="COMPLETED">Completed</option>
            <option value="EXITED">Exited</option>
            <option value="FAILED">Failed</option>
          </select>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {items === null ? (
            <p className="text-xs text-gray-400">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-xs text-gray-400">No enrollments yet.</p>
          ) : (
            <div className="space-y-2">
              {items.map((e: any) => (
                <div key={e.id} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <EnrollmentStatusBadge status={e.status} />
                    <span className="text-xs text-gray-400">
                      Step {e.currentStepIndex + 1}
                    </span>
                  </div>
                  {e.contact && (
                    <p className="text-xs text-gray-700 truncate font-medium">{e.contact.email}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-0.5">
                    {e.status === "ACTIVE" && (
                      <>Next send: {new Date(e.nextSendAt).toLocaleString()}</>
                    )}
                    {e.status === "COMPLETED" && e.completedAt && (
                      <>Completed: {new Date(e.completedAt).toLocaleString()}</>
                    )}
                    {e.status === "EXITED" && (
                      <>Exited{e.exitReason ? ` (${e.exitReason})` : ""}: {e.completedAt ? new Date(e.completedAt).toLocaleString() : ""}</>
                    )}
                    {e.status === "FAILED" && (
                      <>Failed: {e.exitReason ?? "unknown"}</>
                    )}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="px-4 py-2 border-t border-gray-100 shrink-0 text-[11px] text-gray-400 flex items-center gap-1">
          <ShieldCheck size={11} /> Scheduler ticks every 60 seconds.
        </div>
      </div>
    </div>
  );
}

// ─── Enroll panel — collapsible header with single + by-tag tabs ────────────

function EnrollPanel({
  sequenceId,
  sequenceStatus,
  onEnrolled,
  onError,
  onSuccess,
}: {
  sequenceId: string;
  sequenceStatus: Status;
  onEnrolled: () => void;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"single" | "tag">("single");

  if (sequenceStatus !== "ACTIVE") {
    return (
      <div className="px-4 py-2.5 border-b border-gray-100 shrink-0 flex items-start gap-2 text-xs text-amber-700 bg-amber-50">
        <AlertCircle size={12} className="mt-0.5 shrink-0" />
        <span>Activate the sequence to enable enrollment.</span>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="px-4 py-2 border-b border-gray-100 shrink-0">
        <button
          onClick={() => setOpen(true)}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
        >
          <UserPlus size={13} /> Enroll contacts
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 border-b border-gray-100 shrink-0 bg-gray-50 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex bg-white border border-gray-200 rounded-lg p-0.5">
          <button
            onClick={() => setMode("single")}
            className={`px-2.5 py-1 text-[11px] font-medium rounded ${
              mode === "single" ? "bg-blue-600 text-white" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Single
          </button>
          <button
            onClick={() => setMode("tag")}
            className={`px-2.5 py-1 text-[11px] font-medium rounded ${
              mode === "tag" ? "bg-blue-600 text-white" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            By tag
          </button>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="p-1 text-gray-400 hover:text-gray-700 rounded"
          title="Close"
        >
          <X size={12} />
        </button>
      </div>

      {mode === "single" ? (
        <SingleEnrollForm
          sequenceId={sequenceId}
          onEnrolled={() => { onSuccess("Contact enrolled"); onEnrolled(); }}
          onError={onError}
        />
      ) : (
        <TagEnrollForm
          sequenceId={sequenceId}
          onEnrolled={(n, skipped, overflow) => {
            const overflowSuffix = overflow ? " (more remain — re-run to continue)" : "";
            const skipSuffix = skipped > 0 ? ` (${skipped} already enrolled or unsubscribed)` : "";
            onSuccess(`Enrolled ${n} contact${n === 1 ? "" : "s"}${skipSuffix}${overflowSuffix}`);
            onEnrolled();
          }}
          onError={onError}
        />
      )}
    </div>
  );
}

// ─── Single enroll — debounced contact search + Enroll button ───────────────

function SingleEnrollForm({
  sequenceId, onEnrolled, onError,
}: {
  sequenceId: string;
  onEnrolled: () => void;
  onError: (msg: string) => void;
}) {
  const confirm = useConfirm();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ContactHit[]>([]);
  const [picked, setPicked] = useState<ContactHit | null>(null);
  const [searching, setSearching] = useState(false);
  const [enrolling, setEnrolling] = useState(false);

  // Debounced search — refetch 250ms after user stops typing
  useEffect(() => {
    if (picked || query.trim().length < 2) { setHits([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/contacts?search=${encodeURIComponent(query.trim())}`);
        const json = await res.json();
        if (json.success) {
          const all = (json.data?.items ?? json.data ?? []) as ContactHit[];
          setHits(all.slice(0, 8));
        }
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, picked]);

  // Try POST first; if API responds with `skipped: already_*`, surface a
  // confirm dialog and retry with ?reenroll=true.
  async function postEnroll(allowReenroll: boolean): Promise<{ ok: boolean; needsConfirm?: { status: string; completedAt: string | null } }> {
    const url = `/api/sequences/${sequenceId}/enroll${allowReenroll ? "?reenroll=true" : ""}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: picked!.id }),
    });
    const json = await res.json();
    if (!json.success) {
      onError(json.error ?? "Failed to enroll");
      return { ok: false };
    }
    if (json.data?.skipped && json.data.past) {
      return { ok: false, needsConfirm: json.data.past };
    }
    return { ok: true };
  }

  async function handleEnroll() {
    if (!picked) return;
    setEnrolling(true);
    try {
      const first = await postEnroll(false);
      if (first.ok) {
        setPicked(null); setQuery(""); setHits([]);
        onEnrolled();
        return;
      }
      if (!first.needsConfirm) return;

      const past = first.needsConfirm;
      const when = past.completedAt
        ? new Date(past.completedAt).toLocaleDateString()
        : null;
      const confirmed = await confirm({
        title: `Re-enroll ${picked.email}?`,
        description:
          `This contact previously ${past.status.toLowerCase()} this sequence` +
          `${when ? ` on ${when}` : ""}. Re-enrolling will send the full sequence again from step 1.`,
        confirmLabel: "Re-enroll",
        variant: "warning",
      });
      if (!confirmed) return;

      const second = await postEnroll(true);
      if (second.ok) {
        setPicked(null); setQuery(""); setHits([]);
        onEnrolled();
      }
    } finally {
      setEnrolling(false);
    }
  }

  function displayName(c: ContactHit): string {
    const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
    return name ? `${name} <${c.email}>` : c.email;
  }

  return (
    <div className="space-y-2">
      {picked ? (
        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg">
          <Users size={12} className="text-gray-400 shrink-0" />
          <span className="flex-1 text-xs text-gray-900 truncate">{displayName(picked)}</span>
          <button
            onClick={() => { setPicked(null); setQuery(""); }}
            className="p-0.5 text-gray-400 hover:text-gray-700"
            title="Clear"
          >
            <X size={11} />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search contact by email or name…"
            className={`${inputCls} pl-7 text-xs py-1.5`}
          />
          {query.trim().length >= 2 && (
            <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {searching ? (
                <p className="px-3 py-2 text-xs text-gray-400">Searching…</p>
              ) : hits.length === 0 ? (
                <p className="px-3 py-2 text-xs text-gray-400">No matches</p>
              ) : (
                hits.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { setPicked(c); setQuery(""); }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 truncate"
                  >
                    {displayName(c)}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      <button
        onClick={handleEnroll}
        disabled={!picked || enrolling}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
      >
        {enrolling ? <Loader2 size={11} className="animate-spin" /> : <UserPlus size={11} />}
        Enroll
      </button>
    </div>
  );
}

// ─── Bulk enroll by tag — pick tag, show eligible count, enroll all ─────────

function TagEnrollForm({
  sequenceId, onEnrolled, onError,
}: {
  sequenceId: string;
  onEnrolled: (enrolled: number, skipped: number, overflow: boolean) => void;
  onError: (msg: string) => void;
}) {
  const confirm = useConfirm();
  const [tags, setTags] = useState<TagOption[] | null>(null);
  const [tagId, setTagId] = useState<string>("");
  const [taggedCount, setTaggedCount] = useState<number | null>(null);
  const [enrolling, setEnrolling] = useState(false);

  useEffect(() => {
    fetch("/api/tags").then((r) => r.json()).then((j) => {
      if (j.success) setTags(j.data ?? []);
    });
  }, []);

  // Refresh tagged-contact count when tag changes (UX preview before bulk enroll)
  useEffect(() => {
    if (!tagId) { setTaggedCount(null); return; }
    let cancelled = false;
    fetch(`/api/contacts/count?tagId=${tagId}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled && j.success) setTaggedCount(j.data?.total ?? null); });
    return () => { cancelled = true; };
  }, [tagId]);

  async function handleEnroll() {
    if (!tagId) return;
    const tagName = tags?.find((t) => t.id === tagId)?.name ?? "this tag";
    const ok = await confirm({
      title: `Enroll all contacts tagged "${tagName}"?`,
      description: taggedCount != null
        ? `Up to ${taggedCount} eligible contact${taggedCount === 1 ? "" : "s"} will start receiving the sequence. Already-enrolled, unsubscribed, and bounced contacts are skipped.`
        : "All eligible contacts with this tag will start receiving the sequence.",
      confirmLabel: "Enroll all",
      variant: "default",
    });
    if (!ok) return;

    setEnrolling(true);
    try {
      const res = await fetch(`/api/sequences/${sequenceId}/enroll-by-tag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagId }),
      });
      const json = await res.json();
      if (!json.success) { onError(json.error ?? "Bulk enroll failed"); return; }
      setTagId("");
      onEnrolled(json.data?.enrolled ?? 0, json.data?.skipped ?? 0, !!json.data?.overflow);
    } finally {
      setEnrolling(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <TagIcon size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <select
          value={tagId}
          onChange={(e) => setTagId(e.target.value)}
          className={`${inputCls} pl-7 text-xs py-1.5`}
          disabled={tags === null}
        >
          <option value="">{tags === null ? "Loading tags…" : tags.length === 0 ? "No tags yet" : "— Select a tag —"}</option>
          {tags?.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {tagId && taggedCount != null && (
        <p className="text-[11px] text-gray-500 px-1">
          {taggedCount === 0
            ? "No contacts have this tag."
            : `${taggedCount} contact${taggedCount === 1 ? "" : "s"} tagged. Eligible count may be lower (excludes unsubscribed / already enrolled).`}
        </p>
      )}

      <button
        onClick={handleEnroll}
        disabled={!tagId || enrolling || taggedCount === 0}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
      >
        {enrolling ? <Loader2 size={11} className="animate-spin" /> : <UserPlus size={11} />}
        Enroll all
      </button>
    </div>
  );
}

function EnrollmentStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE:    "bg-blue-50 text-blue-700",
    COMPLETED: "bg-emerald-50 text-emerald-700",
    EXITED:    "bg-gray-100 text-gray-600",
    FAILED:    "bg-red-50 text-red-700",
  };
  return (
    <span className={`text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded ${map[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status.toLowerCase()}
    </span>
  );
}
