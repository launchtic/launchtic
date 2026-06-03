// Workflow trigger entrypoint (legacy filename kept to avoid touching 85
// callsites — file now only fires Workflows). Phase 2 may rename this to
// `workflows.ts` once the import surface stabilizes.

import { db } from "@launchtic/database";
import { workflowQueue } from "./queue";

// Phase 1C: legacy TriggerType enum still re-exported to keep callsite
// signatures stable. New trigger types added in Phase 2 just extend this.
export type TriggerType =
  | "NEW_SALE"
  | "SALE_CANCELED"
  | "SUBSCRIPTION_PAYMENT_FAILED"
  | "FORM_SUBMIT"
  | "TAG_ADDED"
  | "TAG_REMOVED"
  | "EMAIL_OPENED"
  | "EMAIL_LINK_CLICKED"
  | "CHECKOUT_STARTED";

export type TriggerContext = {
  contactId?:    string;
  orderId?:      string;
  orderTotal?:   number;
  orderCurrency?: string;
  subscriptionId?: string;
  tagId?:        string;
  funnelId?:     string;
  funnelStepId?: string;
  emailSendId?:  string;
  broadcastId?:  string;
  workflowEmailId?: string;
  linkUrl?:      string;
  [key: string]: unknown;
};

export async function fireTrigger(
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

    // If any workflow filters by stepType, we need to resolve the step's type
    // once for this fire (the trigger context only carries funnelStepId).
    const needsStepType = workflows.some((wf) => {
      const cfg = wf.triggerConfig as Record<string, unknown> | null;
      return cfg != null && typeof cfg.stepType === "string" && cfg.stepType.length > 0;
    });
    let stepType: string | null = null;
    if (needsStepType && context.funnelStepId) {
      const step = await db.funnelStep.findUnique({
        where:  { id: context.funnelStepId },
        select: { type: true },
      });
      stepType = step?.type ?? null;
    }

    const queue = workflowQueue();
    for (const wf of workflows) {
      if (!matchesFilter(wf.triggerConfig as Record<string, unknown> | null, context, stepType)) continue;
      if (!wf.startNodeId) continue;

      // Re-enrollment policy: SINGLE_ACTIVE (default) blocks concurrent runs
      // for the same contact; COOLDOWN blocks if the contact was enrolled
      // recently; ALWAYS lets every fire start a new run.
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
    // Never break the calling flow (payment webhook, form submit, etc.).
    console.error(`[workflows] fireTrigger ${triggerType} failed:`, err);
  }
}

function matchesFilter(
  config:   Record<string, unknown> | null,
  context:  TriggerContext,
  stepType: string | null,
): boolean {
  if (!config) return true;
  if (config.funnelId        && context.funnelId        !== config.funnelId)        return false;
  if (config.tagId           && context.tagId           !== config.tagId)           return false;
  if (config.funnelStepId    && context.funnelStepId    !== config.funnelStepId)    return false;
  if (config.stepType        && stepType                !== config.stepType)        return false;
  if (config.broadcastId     && context.broadcastId     !== config.broadcastId)     return false;
  if (config.workflowEmailId && context.workflowEmailId !== config.workflowEmailId) return false;
  // linkUrl: contains-match. Editor stores the URL as the operator picked
  // it (typically origin+path); runtime URL may have extra query params
  // (utm tags, per-recipient substitutions) so we substring-match to stay
  // forgiving.
  if (config.linkUrl) {
    const ctxUrl = context.linkUrl;
    if (!ctxUrl) return false;
    if (!String(ctxUrl).includes(String(config.linkUrl))) return false;
  }
  return true;
}
