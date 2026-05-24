// Sequence scheduler.
//
// One repeatable BullMQ job ("sequence-tick") fires every 60s. Each tick:
//   1. Fetches a batch of ACTIVE enrollments whose nextSendAt <= now.
//   2. For each enrollment:
//      a. Re-check exit conditions (unsubscribed/bounced/exitTag/purchase).
//         If any match → mark EXITED, decrement activeCount, skip.
//      b. Render the current step → create EmailSend → enqueue email job.
//      c. Advance: if more steps → increment currentStepIndex, set nextSendAt
//         = now + nextStep.delayMinutes; else → mark COMPLETED.
//
// Concurrency:
//   - Worker concurrency=1 (one tick at a time per worker process).
//   - Per-row lock via conditional updateMany (only updates rows still in
//     ACTIVE+nextSendAt<=now state). If two workers race, only one wins.

import { Queue, Worker, type Job } from "bullmq";
import { db, Prisma } from "@launchtic/database";
import { render, renderEmailContent, buildUnsubscribeUrl } from "@launchtic/email/server";
import { getAppUrl } from "../lib/system-config";
import { createRedisConnection } from "../lib/redis";
import { marketingRenderOptions } from "../lib/email-footer";
import { EMAIL_QUEUE_NAME, type EmailJobData } from "./email";

// Shape of an enrollment row loaded by the tick — declared once and reused
// for type-safe helper signatures.
const dueEnrollmentInclude = {
  sequence: {
    select: {
      id: true,
      name: true,
      status: true,
      steps: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          delayMinutes: true,
          emailSubject: true,
          emailHtmlBody: true,
          emailFromName: true,
          emailFromEmail: true,
        },
      },
    },
  },
  contact: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      unsubscribedAt: true,
      bouncedAt: true,
    },
  },
} as const satisfies Prisma.ContactSequenceEnrollmentInclude;

type DueEnrollment = Prisma.ContactSequenceEnrollmentGetPayload<{
  include: typeof dueEnrollmentInclude;
}>;
type DueStep = DueEnrollment["sequence"]["steps"][number];

export const SEQUENCE_QUEUE_NAME = "sequence";
export const SEQUENCE_TICK_JOB_NAME = "sequence-tick";
export const SEQUENCE_TICK_JOB_ID = "sequence-tick-singleton";

export type SequenceTickJobData = Record<string, never>;

const BATCH_SIZE = 200;

async function processTick(_job: Job<SequenceTickJobData>) {
  const now = new Date();

  const due: DueEnrollment[] = await db.contactSequenceEnrollment.findMany({
    where: { status: "ACTIVE", nextSendAt: { lte: now } },
    orderBy: { nextSendAt: "asc" },
    take: BATCH_SIZE,
    include: dueEnrollmentInclude,
  });

  if (due.length === 0) return { processed: 0, sent: 0, exited: 0, completed: 0 };

  const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
    connection: createRedisConnection(),
  });

  let sent = 0;
  let exited = 0;
  let completed = 0;

  // Cache workspace names per tick — typically only a handful per batch.
  const workspaceNames = new Map<string, string>();
  async function getWorkspaceName(workspaceId: string): Promise<string> {
    const hit = workspaceNames.get(workspaceId);
    if (hit) return hit;
    const ws = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true },
    });
    const name = ws?.name ?? "Your Workspace";
    workspaceNames.set(workspaceId, name);
    return name;
  }

  try {
    for (const enrollment of due) {
      try {
        // Sequence paused — leave nextSendAt untouched and skip. Bumping it
        // (the old behavior) compounded across ticks: a 2-hour pause pushed
        // nextSendAt out 120 hours, so resuming didn't actually deliver. The
        // re-query cost of paused enrollments is bounded by BATCH_SIZE per
        // tick and disappears once the operator resumes (status route resets
        // due rows to send immediately on the next tick).
        if (enrollment.sequence.status !== "ACTIVE") {
          continue;
        }

        // Exit-condition checks
        const exitReason = checkExitConditions(enrollment);
        if (exitReason) {
          await exitEnrollment(enrollment.id, enrollment.sequenceId, enrollment.contact.id, exitReason);
          exited++;
          continue;
        }

        const stepIdx = enrollment.currentStepIndex;
        const step = enrollment.sequence.steps[stepIdx];
        if (!step) {
          // Out-of-bounds (shouldn't happen) — mark COMPLETED defensively.
          await completeEnrollment(enrollment.id, enrollment.sequenceId, enrollment.contact.id);
          completed++;
          continue;
        }

        // Optimistic claim — only this row in ACTIVE+nextSendAt<=now state.
        // If another worker already advanced it, the update affects 0 rows
        // and we skip (no double-send).
        const claim = await db.contactSequenceEnrollment.updateMany({
          where: {
            id: enrollment.id,
            status: "ACTIVE",
            currentStepIndex: stepIdx,
            nextSendAt: { lte: now },
          },
          data: { lastSentAt: new Date() },
        });
        if (claim.count === 0) continue;

        const nextIdx = stepIdx + 1;
        const isLastStep = nextIdx >= enrollment.sequence.steps.length;

        await sendStepEmail(
          emailQueue,
          enrollment,
          step,
          await getWorkspaceName(enrollment.workspaceId),
          isLastStep,
        );
        sent++;

        // Advance to next step or complete.
        if (isLastStep) {
          await completeEnrollment(enrollment.id, enrollment.sequenceId, enrollment.contact.id);
          completed++;
        } else {
          const nextStep = enrollment.sequence.steps[nextIdx];
          await db.contactSequenceEnrollment.update({
            where: { id: enrollment.id },
            data: {
              currentStepIndex: nextIdx,
              nextSendAt: new Date(Date.now() + nextStep.delayMinutes * 60_000),
            },
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        console.error(`[sequence] enrollment ${enrollment.id} failed:`, msg);
        // Mark FAILED — operator can re-enroll if needed.
        await db.contactSequenceEnrollment.update({
          where: { id: enrollment.id },
          data: {
            status: "FAILED",
            exitReason: msg.slice(0, 200),
            completedAt: new Date(),
          },
        }).catch(() => {});
        await db.emailSequence.update({
          where: { id: enrollment.sequenceId },
          data: { activeCount: { decrement: 1 } },
        }).catch(() => {});
      }
    }
  } finally {
    await emailQueue.close();
  }

  return { processed: due.length, sent, exited, completed };
}

// Hardcoded compliance exits — always-on, not configurable. Bounced and
// unsubscribed contacts are never sent another email regardless of which
// sequence they're in. Any other "exit" logic (purchase, tag, segment) is
// composed via an automation with the END_SEQUENCE action.
function checkExitConditions(e: DueEnrollment): string | null {
  if (e.contact.bouncedAt) return "bounced";
  if (e.contact.unsubscribedAt) return "unsubscribed";
  return null;
}

async function exitEnrollment(enrollmentId: string, sequenceId: string, contactId: string, reason: string) {
  await db.$transaction([
    db.contactSequenceEnrollment.update({
      where: { id: enrollmentId },
      data: { status: "EXITED", exitReason: reason, completedAt: new Date() },
    }),
    db.emailSequence.update({
      where: { id: sequenceId },
      data: { activeCount: { decrement: 1 }, exitedCount: { increment: 1 } },
    }),
    db.contactEvent.create({
      data: { contactId, type: "SEQUENCE_EXITED", data: { sequenceId, enrollmentId, reason } },
    }),
  ]);
}

// State-only — the SEQUENCE_COMPLETED ContactEvent is emitted by the email
// worker after the last step's EMAIL_SENT lands, so the timeline ordering
// reflects "email delivered → sequence done" rather than "sequence done →
// email delivered" (which is what we'd get if we emitted here, since
// sendStepEmail only enqueues, doesn't await delivery).
async function completeEnrollment(enrollmentId: string, sequenceId: string, _contactId: string) {
  await db.$transaction([
    db.contactSequenceEnrollment.update({
      where: { id: enrollmentId },
      data: { status: "COMPLETED", completedAt: new Date() },
    }),
    db.emailSequence.update({
      where: { id: sequenceId },
      data: { activeCount: { decrement: 1 }, completedCount: { increment: 1 } },
    }),
  ]);
}

async function sendStepEmail(
  emailQueue: Queue<EmailJobData>,
  enrollment: DueEnrollment,
  step: DueStep,
  workspaceName: string,
  isLastStep: boolean,
) {
  const c = enrollment.contact;
  const firstName = c.firstName ?? "";
  const lastName = c.lastName ?? "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim() || c.email;
  const appUrl = await getAppUrl();
  const vars = {
    contact: { firstName, lastName, email: c.email, fullName },
    workspace: { name: workspaceName },
    order: {},
    unsubscribeUrl: buildUnsubscribeUrl(c.id, appUrl),
  };

  const subject = render(step.emailSubject, vars);
  // Sequences are marketing drips — auto-append workspace footer + unsubscribe.
  const renderOpts = await marketingRenderOptions(enrollment.workspaceId);
  const html = await renderEmailContent(step.emailHtmlBody, vars, renderOpts);

  const send = await db.emailSend.create({
    data: {
      workspaceId: enrollment.workspaceId,
      contactId: c.id,
      toEmail: c.email,
      subject,
      bodyHtml: html,
      status: "QUEUED",
      sequenceId: enrollment.sequenceId,
      sequenceStepId: step.id,
      enrollmentId: enrollment.id,
    },
  });

  await emailQueue.add("send", {
    emailSendId: send.id,
    workspaceId: enrollment.workspaceId,
    contactId: c.id,
    to: c.email,
    subject,
    html,
    fromEmail: step.emailFromEmail,
    fromName: step.emailFromName,
    sequenceCompletedOnSend: isLastStep
      ? { sequenceId: enrollment.sequenceId, enrollmentId: enrollment.id }
      : undefined,
  });
}

/**
 * Schedule the singleton repeatable tick job. Safe to call multiple times —
 * BullMQ deduplicates by repeat options + jobId.
 */
export async function ensureSequenceTickScheduled() {
  const queue = new Queue<SequenceTickJobData>(SEQUENCE_QUEUE_NAME, {
    connection: createRedisConnection(),
  });
  try {
    await queue.add(
      SEQUENCE_TICK_JOB_NAME,
      {} as SequenceTickJobData,
      {
        jobId: SEQUENCE_TICK_JOB_ID,
        repeat: { every: 60_000 },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 100 },
      },
    );
    console.log("[sequence] tick scheduled (every 60s)");
  } finally {
    await queue.close();
  }
}

export function createSequenceWorker(): Worker<SequenceTickJobData> {
  const worker = new Worker<SequenceTickJobData>(
    SEQUENCE_QUEUE_NAME,
    processTick,
    {
      connection: createRedisConnection(),
      concurrency: 1,
    },
  );

  worker.on("ready", () => console.log("[sequence] worker ready"));
  worker.on("completed", (_job, result) => {
    if (result && typeof result === "object" && "processed" in result && (result as any).processed > 0) {
      console.log("[sequence] tick:", result);
    }
  });
  worker.on("failed", (_job, err) => console.error("[sequence] tick failed:", err.message));
  worker.on("error", (err) => console.error("[sequence] worker error:", err));

  return worker;
}
