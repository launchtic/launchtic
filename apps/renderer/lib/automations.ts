// Renderer-side automation event bus.
//
// Mirrors apps/web/lib/automations.ts but lives in the renderer because
// payment webhooks (Stripe/PayPal) and form submissions are processed here.
// Both apps enqueue jobs onto the same Redis-backed BullMQ queue; the
// worker app (apps/worker) consumes them.

import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { db } from "@launchtic/database";

const AUTOMATION_QUEUE_NAME = "automation";

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
  orderId?: string;
  orderTotal?: number;
  orderCurrency?: string;
  subscriptionId?: string;
  tagId?: string;
  funnelId?: string;
  funnelStepId?: string;
  emailSendId?: string;
  [key: string]: unknown;
};

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

const g = globalThis as unknown as {
  __launchtic_renderer_redis?: Redis;
  __launchtic_renderer_automation_queue?: Queue;
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
  if (!g.__launchtic_renderer_automation_queue) {
    g.__launchtic_renderer_automation_queue = new Queue(AUTOMATION_QUEUE_NAME, {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: { count: 1000, age: 7 * 24 * 3600 },
        removeOnFail: { count: 2000 },
      },
    });
  }
  return g.__launchtic_renderer_automation_queue;
}

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

    const matching = automations.filter((a) =>
      matchesFilter(a.triggerConfig as Record<string, unknown> | null, context),
    );
    if (matching.length === 0) return;

    const queue = getQueue();
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
    // Never break payment flow because of an automation failure.
    console.error(`[renderer/automations] fireTrigger ${triggerType} failed:`, err);
  }
}

function matchesFilter(
  config: Record<string, unknown> | null,
  context: TriggerContext,
): boolean {
  if (!config) return true;
  if (config.funnelId && context.funnelId !== config.funnelId) return false;
  if (config.tagId && context.tagId !== config.tagId) return false;
  if (config.funnelStepId && context.funnelStepId !== config.funnelStepId) return false;
  return true;
}
