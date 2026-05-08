// Pure validation function for automations.
//
// Used by:
//   - UI builder: real-time feedback while editing
//   - API:        enforced on activate (DRAFT can save with errors,
//                 but cannot transition to ACTIVE if any error exists)
//
// Coverage:
//   A — required fields (block save when activating)
//   B3 — same tag added then removed in same automation (warn)
//   C — orphan reference to deleted tag/funnel/step (warn)
//   D — trigger scope rules (NEW_SALE/FORM_SUBMIT require funnel+step
//        with a compatible step type)

import { isEmptyEmailDoc } from "@launchtic/email";

export type Severity = "error" | "warning";

export type ValidationIssue = {
  severity: Severity;
  code: string;
  message: string;
  // Where the issue lives — drives where the UI shows it.
  // "trigger" → trigger card | number → action index
  cardId: "trigger" | number;
  field?: string;
};

export type ValidationAction = {
  actionType: string;
  actionConfig: Record<string, unknown> | null | undefined;
  emailSubject?: string | null;
  emailHtmlBody?: string | null;
};

// Step types that can fire NEW_SALE (any step that processes a payment).
const SALE_STEP_TYPES = new Set(["CHECKOUT", "UPSELL", "DOWNSELL"]);
// Step types that can fire FORM_SUBMIT.
const FORM_STEP_TYPES = new Set(["OPTIN"]);

export type ValidationInput = {
  triggerType: string;
  triggerConfig: Record<string, unknown> | null | undefined;
  actions: ValidationAction[];
  tags: { id: string }[];
  funnels: { id: string; steps: { id: string; type: string }[] }[];
};

const URL_RE = /^https?:\/\/.+/i;

export function validateAutomation(input: ValidationInput): {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
} {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const tagIds = new Set(input.tags.map((t) => t.id));
  const funnelById = new Map(input.funnels.map((f) => [f.id, f]));

  // ─── C1, C3: orphan references in trigger ──────────────────────────────────
  const tc = input.triggerConfig ?? {};
  const trigTagId = tc.tagId as string | undefined;
  const trigFunnelId = tc.funnelId as string | undefined;
  const trigStepId = tc.funnelStepId as string | undefined;

  if (trigTagId && !tagIds.has(trigTagId)) {
    warnings.push({
      severity: "warning",
      code: "C1",
      message: "Trigger references a tag that no longer exists. Pick another tag or this automation will never fire.",
      cardId: "trigger",
      field: "tagId",
    });
  }
  if (trigFunnelId && !funnelById.has(trigFunnelId)) {
    warnings.push({
      severity: "warning",
      code: "C3",
      message: "Trigger references a funnel that no longer exists.",
      cardId: "trigger",
      field: "funnelId",
    });
  }
  if (trigStepId) {
    const funnel = trigFunnelId ? funnelById.get(trigFunnelId) : undefined;
    const stepExists = funnel?.steps.some((s) => s.id === trigStepId);
    if (!stepExists) {
      warnings.push({
        severity: "warning",
        code: "C3",
        message: "Trigger references a funnel step that no longer exists.",
        cardId: "trigger",
        field: "funnelStepId",
      });
    }
  }

  // ─── D: trigger scope (sale/form triggers must scope to a step) ───────────
  // Industry pattern (ClickFunnels, Kartra, Systeme.io): sale & form triggers
  // are inherently per-step — "fire on any sale anywhere" is rarely what the
  // operator wants and is impossible to model deterministically (which sender
  // identity? which thank-you context?). Force a specific step on save.
  const isSaleTrigger =
    input.triggerType === "NEW_SALE" ||
    input.triggerType === "SALE_CANCELED" ||
    input.triggerType === "SUBSCRIPTION_PAYMENT_FAILED";
  const isFormTrigger = input.triggerType === "FORM_SUBMIT";

  if (isSaleTrigger || isFormTrigger) {
    const validTypes = isSaleTrigger ? SALE_STEP_TYPES : FORM_STEP_TYPES;
    const stepLabel = isSaleTrigger ? "checkout/upsell/downsell" : "opt-in";

    if (!trigFunnelId) {
      errors.push({
        severity: "error",
        code: "D1",
        message: "Pick a funnel for this trigger.",
        cardId: "trigger",
        field: "funnelId",
      });
    }
    if (!trigStepId) {
      errors.push({
        severity: "error",
        code: "D2",
        message: `Pick a ${stepLabel} step for this trigger.`,
        cardId: "trigger",
        field: "funnelStepId",
      });
    } else {
      // Step exists → check type compatibility. Skip when funnel/step is
      // already orphaned (C3 covers that).
      const funnel = trigFunnelId ? funnelById.get(trigFunnelId) : undefined;
      const step = funnel?.steps.find((s) => s.id === trigStepId);
      if (step && !validTypes.has(step.type)) {
        errors.push({
          severity: "error",
          code: "D3",
          message: `This trigger only fires on ${stepLabel} steps. The selected step is "${step.type.toLowerCase()}".`,
          cardId: "trigger",
          field: "funnelStepId",
        });
      }
    }
  }

  // ─── Per-action validation ─────────────────────────────────────────────────
  // Track tagId usage for B3 (ADD↔REMOVE same tag detection)
  const tagUse: Record<string, { add?: number; remove?: number }> = {};

  input.actions.forEach((action, idx) => {
    const cfg = action.actionConfig ?? {};

    if (action.actionType === "SEND_EMAIL") {
      // A1
      if (!action.emailSubject?.trim()) {
        errors.push({
          severity: "error",
          code: "A1",
          message: "Subject is required.",
          cardId: idx,
          field: "emailSubject",
        });
      }
      // A2 — empty body
      if (isEmptyEmailDoc(action.emailHtmlBody)) {
        errors.push({
          severity: "error",
          code: "A2",
          message: "Email body is empty.",
          cardId: idx,
          field: "emailHtmlBody",
        });
      }
    }

    if (action.actionType === "ADD_TAG" || action.actionType === "REMOVE_TAG") {
      const tagId = (cfg.tagId as string | undefined)?.trim();
      if (!tagId) {
        // A3 / A4
        errors.push({
          severity: "error",
          code: action.actionType === "ADD_TAG" ? "A3" : "A4",
          message: action.actionType === "ADD_TAG"
            ? "Select a tag to add."
            : "Select a tag to remove.",
          cardId: idx,
          field: "tagId",
        });
      } else {
        // C2: tag deleted
        if (!tagIds.has(tagId)) {
          warnings.push({
            severity: "warning",
            code: "C2",
            message: "This action references a tag that no longer exists. Pick another tag.",
            cardId: idx,
            field: "tagId",
          });
        }
        // Track for B3
        tagUse[tagId] = tagUse[tagId] ?? {};
        if (action.actionType === "ADD_TAG") tagUse[tagId].add = idx;
        else tagUse[tagId].remove = idx;
      }
    }

    if (action.actionType === "WEBHOOK") {
      const url = (cfg.url as string | undefined)?.trim();
      if (!url) {
        // A5
        errors.push({
          severity: "error",
          code: "A5",
          message: "Webhook URL is required.",
          cardId: idx,
          field: "url",
        });
      } else if (!URL_RE.test(url)) {
        // A6
        errors.push({
          severity: "error",
          code: "A6",
          message: "URL must start with http:// or https://",
          cardId: idx,
          field: "url",
        });
      }
    }

    if (action.actionType === "START_SEQUENCE") {
      const sequenceId = (cfg.sequenceId as string | undefined)?.trim();
      if (!sequenceId) {
        // A7
        errors.push({
          severity: "error",
          code: "A7",
          message: "Select a sequence to enroll the contact in.",
          cardId: idx,
          field: "sequenceId",
        });
      }
    }

    if (action.actionType === "END_SEQUENCE") {
      const sequenceId = (cfg.sequenceId as string | undefined)?.trim();
      if (!sequenceId) {
        // A8
        errors.push({
          severity: "error",
          code: "A8",
          message: "Select a sequence to remove the contact from (or 'All sequences').",
          cardId: idx,
          field: "sequenceId",
        });
      }
    }
  });

  // ─── B3: same tag added then removed (or vice versa) ──────────────────────
  // We don't need a tag name for the warning — UI will resolve by lookup.
  for (const [tagId, ops] of Object.entries(tagUse)) {
    if (ops.add !== undefined && ops.remove !== undefined) {
      const earlier = Math.min(ops.add, ops.remove);
      // Attach the warning to the LATER step so it appears alongside the cancelling action.
      const later = Math.max(ops.add, ops.remove);
      warnings.push({
        severity: "warning",
        code: "B3",
        message: `This automation adds and removes the same tag (steps ${earlier + 1} and ${later + 1}). The net effect is nothing — did you mean a different tag?`,
        cardId: later,
      });
    }
  }

  return { errors, warnings };
}
