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
import { automationQueue, workflowQueue } from "./queue";

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
  // Fire BOTH legacy Automation runs and new Workflow runs in parallel — the
  // refactor coexistence period (Phase 1A/1B). Phase 1C drops the legacy
  // automation path.
  await Promise.all([
    fireLegacyAutomations(workspaceId, triggerType, context),
    fireWorkflows(workspaceId, triggerType, context),
  ]);
}

async function fireLegacyAutomations(
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

// New graph-workflow path. Mirrors automations.fire flow but:
//  - matches Workflow rows (separate table)
//  - applies re-enrollment policy (SINGLE_ACTIVE / ALWAYS / COOLDOWN)
//  - enqueues the FIRST node of the graph; the executor walks the rest
async function fireWorkflows(
  workspaceId: string,
  triggerType: TriggerType,
  context: TriggerContext,
): Promise<void> {
  try {
    const workflows = await db.workflow.findMany({
      where: { workspaceId, status: "ACTIVE", triggerType },
      select: {
        id: true, triggerConfig: true, startNodeId: true,
        reEnrollPolicy: true, reEnrollCooldownDays: true,
      },
    });
    if (workflows.length === 0) return;

    const queue = workflowQueue();
    for (const wf of workflows) {
      if (!matchesFilter(wf.triggerConfig as Record<string, unknown> | null, context)) continue;
      if (!wf.startNodeId) continue;

      // Re-enrollment policy gate.
      if (context.contactId) {
        if (wf.reEnrollPolicy === "SINGLE_ACTIVE") {
          const existing = await db.workflowRun.findFirst({
            where: { workflowId: wf.id, contactId: context.contactId, status: "ACTIVE" },
            select: { id: true },
          });
          if (existing) continue;
        } else if (wf.reEnrollPolicy === "COOLDOWN" && wf.reEnrollCooldownDays) {
          const cooldownAt = new Date(Date.now() - wf.reEnrollCooldownDays * 86_400_000);
          const recent = await db.workflowRun.findFirst({
            where: { workflowId: wf.id, contactId: context.contactId, startedAt: { gte: cooldownAt } },
            select: { id: true },
          });
          if (recent) continue;
        }
      }

      const run = await db.workflowRun.create({
        data: {
          workflowId:    wf.id,
          workspaceId,
          contactId:     context.contactId ?? null,
          status:        "ACTIVE",
          currentNodeId: wf.startNodeId,
          triggerData:   context as any,
        },
        select: { id: true },
      });
      await db.workflow.update({
        where: { id: wf.id },
        data:  {
          totalEnrolled:   { increment: 1 },
          activeCount:     { increment: 1 },
          lastTriggeredAt: new Date(),
        },
      }).catch(() => {});

      await queue.add("step", { runId: run.id, workspaceId, nodeId: wf.startNodeId });
    }
  } catch (err) {
    console.error(`[workflows] fireTrigger ${triggerType} failed:`, err);
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
