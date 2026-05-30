import { DelayedError, Queue, Worker, type Job } from "bullmq";
import { db } from "@launchtic/database";
import { sendEmail } from "@launchtic/email/server";
import { createRedisConnection } from "../lib/redis";
import { loadWorkspaceSmtp } from "../lib/smtp";
import {
  isUnderDailyQuota,
  recordDailySend,
  releaseConcurrent,
  tryAcquireConcurrent,
  tryAcquirePerSecond,
} from "../lib/rateLimit";

export const EMAIL_QUEUE_NAME = "email";

// Job payload — kept minimal. Content is already rendered by the producer
// (broadcast fan-out / automation runner / sequence scheduler) so the worker
// just transports.
export type EmailJobData = {
  emailSendId: string;       // EmailSend row already created in DB
  workspaceId: string;
  contactId?: string;        // logged into ContactEvent on success/failure
  to: string;
  subject: string;
  html: string;
  fromEmail: string;
  fromName: string;
  broadcastId?: string;
};

// Dedicated connection for rate-limit primitives. Separate from the BullMQ
// worker connection (which BullMQ owns) so we don't fight over command pipelines.
const rateLimitRedis = createRedisConnection();

export function createEmailQueue(): Queue<EmailJobData> {
  return new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
    connection: createRedisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 30_000 },
      removeOnComplete: { count: 1000, age: 24 * 3600 },
      removeOnFail: { count: 5000 },
    },
  });
}

// SMTP error codes that indicate the recipient is permanently undeliverable
// (vs temporary/network failures). Surfaces as ContactEvent EMAIL_BOUNCED so
// the operator can see hard bounces in the contact timeline. Soft bounces
// (4xx) keep retrying until attempts exhausted, then logged as failed but
// not as bounce — they're not the contact's fault.
const HARD_BOUNCE_CODES = ["550", "551", "553", "554", "557"];

function looksLikeHardBounce(error: unknown): boolean {
  const msg = String((error as { message?: unknown })?.message ?? error ?? "");
  return HARD_BOUNCE_CODES.some((code) => msg.includes(code));
}

async function processEmailJob(job: Job<EmailJobData>, token?: string) {
  const { emailSendId, workspaceId, contactId, to, subject, html, fromEmail, fromName, broadcastId } = job.data;

  const smtp = await loadWorkspaceSmtp(workspaceId);
  if (!smtp) {
    await db.emailSend.update({
      where: { id: emailSendId },
      data: { status: "FAILED", failedAt: new Date(), errorMessage: "SMTP not configured" },
    });
    if (broadcastId) {
      await db.broadcast.update({
        where: { id: broadcastId },
        data: { failedCount: { increment: 1 } },
      }).catch(() => {});
    }
    throw new Error(`SMTP not configured for workspace ${workspaceId}`);
  }

  // ─── Rate limiting (per-workspace) ───────────────────────────────────────
  // All checks delay the job back into the queue rather than failing it, so
  // EmailSend stays QUEUED and Broadcast counters aren't polluted.

  // Daily quota — soonest retry = next UTC midnight. Use a coarser delay (1h)
  // so jobs don't all stampede at midnight.
  if (smtp.maxPerDay) {
    const allowed = await isUnderDailyQuota(rateLimitRedis, workspaceId, smtp.maxPerDay);
    if (!allowed) {
      await job.moveToDelayed(Date.now() + 60 * 60 * 1000, token);
      throw new DelayedError();
    }
  }

  // Per-second cap — throttle bursts. Retry in ~1.1s when window resets.
  if (smtp.maxPerSecond) {
    const allowed = await tryAcquirePerSecond(rateLimitRedis, workspaceId, smtp.maxPerSecond);
    if (!allowed) {
      await job.moveToDelayed(Date.now() + 1100, token);
      throw new DelayedError();
    }
  }

  // Concurrent connection cap — most SMTP providers enforce 1-3 simultaneous
  // sessions and respond 421 when exceeded. Acquire here, release in finally.
  let acquiredConcurrent = false;
  if (smtp.maxConcurrent) {
    const allowed = await tryAcquireConcurrent(rateLimitRedis, workspaceId, smtp.maxConcurrent);
    if (!allowed) {
      await job.moveToDelayed(Date.now() + 250, token);
      throw new DelayedError();
    }
    acquiredConcurrent = true;
  }

  try {
    const result = await sendEmail(smtp, { to, subject, html, fromEmail, fromName });
    await db.emailSend.update({
      where: { id: emailSendId },
      data: {
        status: "SENT",
        sentAt: new Date(),
        providerMessageId: result.messageId || null,
      },
    });
    if (contactId) {
      await db.contactEvent.create({
        data: {
          contactId,
          type: "EMAIL_SENT",
          data: { emailSendId, subject, to, providerMessageId: result.messageId || null },
        },
      }).catch(() => {});
    }
    if (broadcastId) {
      await db.broadcast.update({
        where: { id: broadcastId },
        data: { sentCount: { increment: 1 } },
      }).catch(() => {});
    }
    if (smtp.maxPerDay) {
      await recordDailySend(rateLimitRedis, workspaceId).catch(() => {});
    }
    return { messageId: result.messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown send error";
    // Only mark FAILED on the final attempt — earlier attempts will retry.
    if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
      const isBounce = looksLikeHardBounce(error);
      await db.emailSend.update({
        where: { id: emailSendId },
        data: {
          status: isBounce ? "BOUNCED" : "FAILED",
          failedAt: new Date(),
          errorMessage: message.slice(0, 500),
        },
      });
      if (isBounce && contactId) {
        // Hard bounce → mark contact bounced (worker exit logic blocks future
        // sends to bounced contacts) + emit timeline event.
        await db.contact.update({
          where: { id: contactId },
          data: { bouncedAt: new Date() },
        }).catch(() => {});
        await db.contactEvent.create({
          data: {
            contactId,
            type: "EMAIL_BOUNCED",
            data: { emailSendId, subject, to, error: message.slice(0, 200) },
          },
        }).catch(() => {});
      }
      // Non-bounce FAILED: surfaced via EmailSend.errorMessage already; no
      // ContactEvent (contact didn't do anything wrong, infra issue).
      if (broadcastId) {
        await db.broadcast.update({
          where: { id: broadcastId },
          data: { failedCount: { increment: 1 } },
        }).catch(() => {});
      }
    }
    throw error;
  } finally {
    if (acquiredConcurrent) {
      await releaseConcurrent(rateLimitRedis, workspaceId).catch(() => {});
    }
  }
}

export function createEmailWorker(): Worker<EmailJobData> {
  const worker = new Worker<EmailJobData>(EMAIL_QUEUE_NAME, processEmailJob, {
    connection: createRedisConnection(),
    concurrency: Number(process.env.EMAIL_WORKER_CONCURRENCY ?? 5),
  });

  worker.on("ready", () => console.log(`[email] worker ready (concurrency=${worker.opts.concurrency})`));
  worker.on("completed", (job) => console.log(`[email] sent ${job.data.emailSendId} → ${job.data.to}`));
  worker.on("failed", (job, err) => {
    if (err instanceof DelayedError) return; // expected — rate-limited, requeued
    console.error(`[email] failed ${job?.data.emailSendId} attempt=${job?.attemptsMade}:`, err.message);
  });
  worker.on("error", (err) => console.error("[email] worker error:", err));

  return worker;
}
