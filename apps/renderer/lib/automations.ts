// Renderer-side workflow trigger (legacy filename kept). Same logic as the
// web app's lib/automations.ts but with its own BullMQ producer because
// payment webhooks and form submissions live here, not in apps/web.

import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { db } from "@launchtic/database";

const WORKFLOW_QUEUE_NAME = "workflow";

export type TriggerType =
  | "NEW_SALE"
  | "SALE_CANCELED"
  | "SUBSCRIPTION_PAYMENT_FAILED"
  | "FORM_SUBMIT"
  | "TAG_ADDED"
  | "TAG_REMOVED"
  | "EMAIL_LINK_CLICKED";

export type TriggerContext = {
  contactId?:     string;
  orderId?:       string;
  orderTotal?:    number;
  orderCurrency?: string;
  subscriptionId?: string;
  tagId?:         string;
  funnelId?:      string;
  funnelStepId?:  string;
  emailSendId?:   string;
  [key: string]:  unknown;
};

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

const g = globalThis as unknown as {
  __launchtic_renderer_redis?: Redis;
  __launchtic_renderer_workflow_queue?: Queue;
};

function getConnection(): Redis {
  if (!g.__launchtic_renderer_redis) {
    g.__launchtic_renderer_redis = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return g.__launchtic_renderer_redis;
}

function getQueue(): Queue {
  if (!g.__launchtic_renderer_workflow_queue) {
    g.__launchtic_renderer_workflow_queue = new Queue(WORKFLOW_QUEUE_NAME, {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: { count: 1000, age: 7 * 24 * 3600 },
        removeOnFail:     { count: 2000 },
      },
    });
  }
  return g.__launchtic_renderer_workflow_queue;
}

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

    const queue = getQueue();
    for (const wf of workflows) {
      if (!matchesFilter(wf.triggerConfig as Record<string, unknown> | null, context)) continue;
      if (!wf.startNodeId) continue;

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
    console.error(`[renderer/workflows] fireTrigger ${triggerType} failed:`, err);
  }
}

function matchesFilter(config: Record<string, unknown> | null, context: TriggerContext): boolean {
  if (!config) return true;
  if (config.funnelId     && context.funnelId     !== config.funnelId)     return false;
  if (config.tagId        && context.tagId        !== config.tagId)        return false;
  if (config.funnelStepId && context.funnelStepId !== config.funnelStepId) return false;
  return true;
}
