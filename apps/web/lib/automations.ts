// Automation event bus.
//
// Call fireTrigger() from anywhere a relevant event happens (Stripe webhook,
// PayPal webhook, tag CRUD, form submit). It finds matching ACTIVE automations,
// applies trigger filters, creates an AutomationRun row, and enqueues a job
// for the worker to execute.
//
// Designed to be safe to call without awaiting completion — callers shouldn't
// block their own response on automation execution. Errors here are logged
// but do not propagate (an automation failing should never break a payment
// webhook).

import { db } from "@launchtic/database";
import { automationQueue } from "./queue";

export type TriggerType =
  | "NEW_SALE"
  | "SALE_CANCELED"
  | "SUBSCRIPTION_PAYMENT_FAILED"
  | "FORM_SUBMIT"
  | "TAG_ADDED"
  | "TAG_REMOVED"
  | "EMAIL_LINK_CLICKED";

export type TriggerContext = {
  contactId?: string;
  // Trigger-specific data — will be passed to the run as triggerData and
  // exposed to template variables.
  orderId?: string;
  orderTotal?: number;
  orderCurrency?: string;
  subscriptionId?: string;
  tagId?: string;
  funnelId?: string;
  funnelStepId?: string;
  emailSendId?: string;
  // Allow arbitrary extras
  [key: string]: unknown;
};

export async function fireTrigger(
  workspaceId: string,
  triggerType: TriggerType,
  context: TriggerContext,
): Promise<void> {
  try {
    const automations = await db.automation.findMany({
      where: { workspaceId, status: "ACTIVE", triggerType },
      select: { id: true, triggerConfig: true },
    });

    const matching = automations.filter((a) => matchesFilter(a.triggerConfig as any, context));
    if (matching.length === 0) return;

    const queue = automationQueue();

    for (const a of matching) {
      const run = await db.automationRun.create({
        data: {
          automationId: a.id,
          workspaceId,
          contactId: context.contactId ?? null,
          status: "PENDING",
          triggerData: context as any,
        },
      });

      await queue.add("execute", { runId: run.id, workspaceId });
    }
  } catch (err) {
    // Log but do not throw — automations failing must never break payment flow.
    console.error(`[automations] fireTrigger ${triggerType} failed:`, err);
  }
}

// Apply per-trigger filter rules from triggerConfig JSON.
// Returns true if context satisfies the filter.
function matchesFilter(config: Record<string, unknown> | null, context: TriggerContext): boolean {
  if (!config) return true;

  // NEW_SALE filters
  if (config.funnelId && context.funnelId !== config.funnelId) return false;

  // TAG_ADDED / TAG_REMOVED filter
  if (config.tagId && context.tagId !== config.tagId) return false;

  // FORM_SUBMIT filter
  if (config.funnelStepId && context.funnelStepId !== config.funnelStepId) return false;

  return true;
}
