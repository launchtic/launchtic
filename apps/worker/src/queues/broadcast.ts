// Broadcast dispatch worker.
//
// Lifecycle:
//   1. API enqueues a "dispatch-<broadcastId>" job (now or with delay).
//   2. This worker loads the broadcast, queries the target audience,
//      creates one EmailSend row per recipient, and enqueues an "email"
//      job for each. Email worker (queues/email.ts) does the actual SMTP send.
//   3. Broadcast.status transitions: SCHEDULED|DRAFT → SENDING → SENT.
//
// Why fan-out here (not in the API): a broadcast can have 100k recipients;
// doing the loop in the HTTP request would time out and block.

import { Queue, Worker, type Job } from "bullmq";
import { db } from "@launchtic/database";
import { render, renderEmailContent, buildUnsubscribeUrl } from "@launchtic/email/server";
import { getAppUrl } from "../lib/system-config";
import { createRedisConnection } from "../lib/redis";
import { EMAIL_QUEUE_NAME, type EmailJobData } from "./email";

export const BROADCAST_QUEUE_NAME = "broadcast";

export type BroadcastDispatchJobData = {
  broadcastId: string;
  workspaceId: string;
};

const BATCH_SIZE = 200;

async function processBroadcastDispatch(job: Job<BroadcastDispatchJobData>) {
  const { broadcastId, workspaceId } = job.data;

  const broadcast = await db.broadcast.findFirst({ where: { id: broadcastId, workspaceId } });
  if (!broadcast) throw new Error(`Broadcast ${broadcastId} not found`);

  // Idempotency: only DRAFT or SCHEDULED can be dispatched.
  if (broadcast.status !== "DRAFT" && broadcast.status !== "SCHEDULED") {
    console.log(`[broadcast] skip ${broadcastId} status=${broadcast.status}`);
    return { skipped: true, status: broadcast.status };
  }

  await db.broadcast.update({
    where: { id: broadcastId },
    data: { status: "SENDING" },
  });

  // Producer-side queue handle for enqueueing email jobs.
  const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
    connection: createRedisConnection(),
  });

  const workspace = await db.workspace.findUnique({ where: { id: workspaceId } });
  const workspaceName = workspace?.name ?? "Your Workspace";

  // Build target query
  const where: any = {
    workspaceId,
  };
  if (broadcast.excludeUnsubscribed) {
    where.unsubscribedAt = null;
    where.bouncedAt = null;
  }
  if (broadcast.targetType === "TAG" && broadcast.targetTagIds.length > 0) {
    where.tags = { some: { tagId: { in: broadcast.targetTagIds } } };
  }

  let totalRecipients = 0;
  let queuedCount = 0;
  let cursorId: string | null = null;

  // Cursor-paginated loop — handles 100k+ contacts without loading all in memory.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const batch: { id: string; email: string; firstName: string | null; lastName: string | null }[] =
      await db.contact.findMany({
        where,
        orderBy: { id: "asc" },
        take: BATCH_SIZE,
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        select: { id: true, email: true, firstName: true, lastName: true },
      });

    if (batch.length === 0) break;
    cursorId = batch[batch.length - 1].id;
    totalRecipients += batch.length;

    // Render every email up-front so the EmailSend row carries the rendered
    // subject + bodyHtml snapshot (audit / support visibility). Rendering
    // happens in parallel; cheap because maily render is in-process.
    const appUrl = await getAppUrl();
    const rendered = await Promise.all(batch.map(async (c) => {
      const firstName = c.firstName ?? "";
      const lastName = c.lastName ?? "";
      const fullName = [firstName, lastName].filter(Boolean).join(" ").trim() || c.email;
      const vars = {
        contact: { firstName, lastName, email: c.email, fullName },
        workspace: { name: workspaceName },
        order: {},
        unsubscribeUrl: buildUnsubscribeUrl(c.id, appUrl),
      };
      return {
        contact: c,
        subject: render(broadcast.subject, vars),
        html: await renderEmailContent(broadcast.htmlBody, vars),
      };
    }));

    // Pattern B source columns (generic + snapshot). sourceLabel = broadcast
    // name at send time, survives broadcast rename/delete in the logs UI.
    await db.emailSend.createMany({
      data: rendered.map((r) => ({
        workspaceId,
        contactId:   r.contact.id,
        toEmail:     r.contact.email,
        subject:     r.subject,
        bodyHtml:    r.html,
        status:      "QUEUED" as const,
        sourceType:  "BROADCAST",
        sourceId:    broadcastId,
        sourceLabel: broadcast.name,
      })),
    });

    // Re-fetch with IDs (createMany doesn't return rows). Filter by
    // sourceType + sourceId so we only pick up rows this dispatch created
    // (matches the (sourceType, sourceId) index added in Pattern B).
    const created = await db.emailSend.findMany({
      where: {
        sourceType: "BROADCAST",
        sourceId:   broadcastId,
        contactId:  { in: batch.map((c) => c.id) },
      },
      select: { id: true, contactId: true, toEmail: true },
    });

    const sendByContact = new Map(created.map((s) => [s.contactId!, s]));

    const jobs = rendered.map((r) => {
      const send = sendByContact.get(r.contact.id)!;
      return {
        name: "send",
        data: {
          emailSendId: send.id,
          workspaceId,
          contactId: r.contact.id,
          to: send.toEmail,
          subject: r.subject,
          html: r.html,
          fromEmail: broadcast.fromEmail,
          fromName: broadcast.fromName,
          broadcastId,
        } as EmailJobData,
      };
    });

    await emailQueue.addBulk(jobs);
    queuedCount += jobs.length;

    if (batch.length < BATCH_SIZE) break;
  }

  await db.broadcast.update({
    where: { id: broadcastId },
    data: {
      status: "SENT",
      sentAt: new Date(),
      totalRecipients,
    },
  });

  await emailQueue.close();

  console.log(`[broadcast] dispatched ${broadcastId}: ${queuedCount} emails enqueued`);
  return { totalRecipients, queuedCount };
}

export function createBroadcastWorker(): Worker<BroadcastDispatchJobData> {
  const worker = new Worker<BroadcastDispatchJobData>(
    BROADCAST_QUEUE_NAME,
    processBroadcastDispatch,
    {
      connection: createRedisConnection(),
      concurrency: 1, // serialize dispatches per worker; emails parallelize via the email queue
    },
  );

  worker.on("ready", () => console.log("[broadcast] worker ready"));
  worker.on("completed", (job, result) => {
    console.log(`[broadcast] dispatched ${job.data.broadcastId}:`, result);
  });
  worker.on("failed", async (job, err) => {
    console.error(`[broadcast] failed ${job?.data.broadcastId}:`, err.message);
    if (job?.data.broadcastId && job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
      await db.broadcast.update({
        where: { id: job.data.broadcastId },
        data: { status: "FAILED" },
      }).catch(() => {});
    }
  });
  worker.on("error", (err) => console.error("[broadcast] worker error:", err));

  return worker;
}
