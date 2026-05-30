// Producer-side queue helpers for the web app.
// The worker app (apps/worker) defines the consumers; this module only
// enqueues jobs from API routes.

import { Queue } from "bullmq";
import { Redis } from "ioredis";

// Queue names — kept in sync with apps/worker/src/queues/*
export const EMAIL_QUEUE_NAME     = "email";
export const BROADCAST_QUEUE_NAME = "broadcast";
export const WORKFLOW_QUEUE_NAME  = "workflow";

// Job payload contracts — keep in sync with worker
export type EmailJobData = {
  emailSendId: string;
  workspaceId: string;
  contactId?: string;
  to: string;
  subject: string;
  html: string;
  fromEmail: string;
  fromName: string;
  broadcastId?: string;
};

export type BroadcastDispatchJobData = {
  broadcastId: string;
  workspaceId: string;
};

// Workflow state-machine job — one node executed per job, then re-enqueued
// for the next node (or scheduled with delay).
export type WorkflowJobData = {
  runId:       string;
  workspaceId: string;
  nodeId:      string;
};

// Single shared Redis connection for producers — Next.js dev re-imports this
// module on each HMR cycle, so cache via globalThis to avoid leaks.
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

const g = globalThis as unknown as {
  __launchtic_redis?: Redis;
  __launchtic_email_queue?: Queue<EmailJobData>;
  __launchtic_broadcast_queue?: Queue<BroadcastDispatchJobData>;
  __launchtic_workflow_queue?: Queue<WorkflowJobData>;
};

function getConnection(): Redis {
  if (!g.__launchtic_redis) {
    g.__launchtic_redis = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: false,
    });
  }
  return g.__launchtic_redis;
}

export function emailQueue(): Queue<EmailJobData> {
  if (!g.__launchtic_email_queue) {
    g.__launchtic_email_queue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: { count: 1000, age: 24 * 3600 },
        removeOnFail: { count: 5000 },
      },
    });
  }
  return g.__launchtic_email_queue;
}

export function broadcastQueue(): Queue<BroadcastDispatchJobData> {
  if (!g.__launchtic_broadcast_queue) {
    g.__launchtic_broadcast_queue = new Queue<BroadcastDispatchJobData>(BROADCAST_QUEUE_NAME, {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 60_000 },
        removeOnComplete: { count: 200, age: 7 * 24 * 3600 },
        removeOnFail: { count: 1000 },
      },
    });
  }
  return g.__launchtic_broadcast_queue;
}

// Deterministic job ID for a broadcast dispatch — lets us cancel by knowing
// only the broadcast ID.
export function dispatchJobId(broadcastId: string): string {
  return `dispatch-${broadcastId}`;
}

export function workflowQueue(): Queue<WorkflowJobData> {
  if (!g.__launchtic_workflow_queue) {
    g.__launchtic_workflow_queue = new Queue<WorkflowJobData>(WORKFLOW_QUEUE_NAME, {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: { count: 1000, age: 7 * 24 * 3600 },
        removeOnFail:     { count: 2000 },
      },
    });
  }
  return g.__launchtic_workflow_queue;
}
