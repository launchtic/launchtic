// Automation run worker.
//
// Lifecycle:
//   1. fireTrigger() (in apps/web/lib/automations.ts) creates an AutomationRun
//      row with status=PENDING and enqueues a job here.
//   2. This worker loads the run, the parent automation + actions (ordered),
//      and the trigger contact. It executes each action in sequence,
//      best-effort (one action's failure does not halt subsequent ones).
//   3. Run.status transitions: PENDING → COMPLETED (all ok) | FAILED (≥1 err).
//      First error message is recorded on Run.errorMessage.

import { Queue, Worker, type Job } from "bullmq";
import { db } from "@launchtic/database";
import { render, renderEmailContent, buildUnsubscribeUrl } from "@launchtic/email/server";
import { marketingRenderOptions } from "../lib/email-footer";
import { createRedisConnection } from "../lib/redis";
import { EMAIL_QUEUE_NAME, type EmailJobData } from "./email";

export const AUTOMATION_QUEUE_NAME = "automation";

export type AutomationRunJobData = {
  runId: string;
  workspaceId: string;
};

type ActionRow = {
  id: string;
  order: number;
  actionType: string;
  actionConfig: any;
  emailTemplateId: string | null;
  emailSubject: string | null;
  emailHtmlBody: string | null;
  emailFromName: string | null;
  emailFromEmail: string | null;
};

type Ctx = {
  workspaceId: string;
  workspaceName: string;
  runId: string;
  automationId: string;
  contactId: string | null;
  contact: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
  triggerData: Record<string, unknown>;
};

async function processAutomationRun(job: Job<AutomationRunJobData>) {
  const { runId, workspaceId } = job.data;

  const run = await db.automationRun.findFirst({
    where: { id: runId, workspaceId },
    include: {
      automation: { include: { actions: { orderBy: { order: "asc" } } } },
      contact: { select: { id: true, email: true, firstName: true, lastName: true } },
    },
  });
  if (!run) throw new Error(`AutomationRun ${runId} not found`);

  // Idempotency: only PENDING runs are eligible.
  if (run.status !== "PENDING") {
    return { skipped: true, status: run.status };
  }

  const workspace = await db.workspace.findUnique({ where: { id: workspaceId } });
  const ctx: Ctx = {
    workspaceId,
    workspaceName: workspace?.name ?? "Your Workspace",
    runId,
    automationId: run.automationId,
    contactId: run.contactId,
    contact: run.contact,
    triggerData: (run.triggerData ?? {}) as Record<string, unknown>,
  };

  let firstError: string | null = null;
  let completedActions = 0;

  for (const action of run.automation.actions) {
    try {
      await executeAction(action, ctx);
      completedActions++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      console.error(`[automation] action ${action.id} (${action.actionType}) failed:`, msg);
      if (!firstError) firstError = `Action #${action.order + 1} (${action.actionType}): ${msg}`;
      // Continue to next action — best-effort
    }
  }

  await db.automationRun.update({
    where: { id: runId },
    data: {
      status: firstError ? "FAILED" : "COMPLETED",
      completedAt: new Date(),
      errorMessage: firstError?.slice(0, 500),
    },
  });

  // Update automation stats (denormalized counters)
  await db.automation.update({
    where: { id: run.automationId },
    data: {
      timesTriggered: { increment: 1 },
      lastTriggeredAt: new Date(),
    },
  });

  return { completedActions, totalActions: run.automation.actions.length, firstError };
}

async function executeAction(action: ActionRow, ctx: Ctx): Promise<void> {
  switch (action.actionType) {
    case "SEND_EMAIL":
      return execSendEmail(action, ctx);
    case "ADD_TAG":
      return execAddTag(action, ctx);
    case "REMOVE_TAG":
      return execRemoveTag(action, ctx);
    case "WEBHOOK":
      return execWebhook(action, ctx);
    case "START_SEQUENCE":
      return execStartSequence(action, ctx);
    case "END_SEQUENCE":
      return execEndSequence(action, ctx);
    default:
      throw new Error(`Unknown action type: ${action.actionType}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// SEND_EMAIL
// ─────────────────────────────────────────────────────────────────

async function execSendEmail(action: ActionRow, ctx: Ctx): Promise<void> {
  if (!ctx.contact) throw new Error("SEND_EMAIL requires a contact (no contact in trigger context)");
  if (!action.emailSubject || !action.emailHtmlBody || !action.emailFromEmail || !action.emailFromName) {
    throw new Error("SEND_EMAIL action missing subject/body/sender");
  }

  const c = ctx.contact;
  const firstName = c.firstName ?? "";
  const lastName = c.lastName ?? "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim() || c.email;
  const vars = {
    contact: { firstName, lastName, email: c.email, fullName },
    workspace: { name: ctx.workspaceName },
    order: ctx.triggerData.order ?? {},
    unsubscribeUrl: buildUnsubscribeUrl(c.id),
    ...ctx.triggerData,
  };

  const subject = render(action.emailSubject, vars);
  // Automation SEND_EMAIL is treated as marketing — auto-append unsubscribe.
  // (Pure transactional automations should send via a separate transactional
  // route, not Automation actions.)
  const renderOpts = await marketingRenderOptions(ctx.workspaceId);
  const html = await renderEmailContent(action.emailHtmlBody, vars, renderOpts);

  // Persist EmailSend (audit log) — we link it to both the automation and the
  // specific action that produced it.
  const send = await db.emailSend.create({
    data: {
      workspaceId: ctx.workspaceId,
      contactId: c.id,
      toEmail: c.email,
      subject,
      bodyHtml: html,
      status: "QUEUED",
      automationId: ctx.automationId,
      automationRunId: ctx.runId,
      automationActionId: action.id,
    },
  });

  // Enqueue actual SMTP send via the email worker
  const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
    connection: createRedisConnection(),
  });
  try {
    await emailQueue.add("send", {
      emailSendId: send.id,
      workspaceId: ctx.workspaceId,
      contactId: c.id,
      to: c.email,
      subject,
      html,
      fromEmail: action.emailFromEmail,
      fromName: action.emailFromName,
    });
  } finally {
    await emailQueue.close();
  }
}

// ─────────────────────────────────────────────────────────────────
// ADD_TAG / REMOVE_TAG
// ─────────────────────────────────────────────────────────────────

async function execAddTag(action: ActionRow, ctx: Ctx): Promise<void> {
  if (!ctx.contact) throw new Error("ADD_TAG requires a contact");
  const tagId = action.actionConfig?.tagId as string | undefined;
  if (!tagId) throw new Error("ADD_TAG missing tagId in actionConfig");

  // Verify tag belongs to workspace (defensive — schema doesn't enforce cross-table)
  const tag = await db.tag.findFirst({ where: { id: tagId, workspaceId: ctx.workspaceId } });
  if (!tag) throw new Error(`Tag ${tagId} not found in workspace`);

  // Upsert ContactTag — idempotent
  await db.contactTag.upsert({
    where: { contactId_tagId: { contactId: ctx.contact.id, tagId } },
    create: { contactId: ctx.contact.id, tagId },
    update: {},
  });

  // Audit timeline
  await db.contactEvent.create({
    data: {
      contactId: ctx.contact.id,
      type: "TAG_ADDED",
      data: { tagId, source: "automation", automationId: ctx.automationId },
    },
  });
}

async function execRemoveTag(action: ActionRow, ctx: Ctx): Promise<void> {
  if (!ctx.contact) throw new Error("REMOVE_TAG requires a contact");
  const tagId = action.actionConfig?.tagId as string | undefined;
  if (!tagId) throw new Error("REMOVE_TAG missing tagId in actionConfig");

  await db.contactTag
    .delete({ where: { contactId_tagId: { contactId: ctx.contact.id, tagId } } })
    .catch(() => {});  // ignore "not found" — idempotent

  await db.contactEvent.create({
    data: {
      contactId: ctx.contact.id,
      type: "TAG_REMOVED",
      data: { tagId, source: "automation", automationId: ctx.automationId },
    },
  });
}

// ─────────────────────────────────────────────────────────────────
// START_SEQUENCE — enroll the trigger contact in an email sequence
// ─────────────────────────────────────────────────────────────────

async function execStartSequence(action: ActionRow, ctx: Ctx): Promise<void> {
  if (!ctx.contact) throw new Error("START_SEQUENCE requires a contact");
  const sequenceId = action.actionConfig?.sequenceId as string | undefined;
  if (!sequenceId) throw new Error("START_SEQUENCE missing sequenceId in actionConfig");

  // Verify sequence belongs to workspace + load first step delay.
  const sequence = await db.emailSequence.findFirst({
    where: { id: sequenceId, workspaceId: ctx.workspaceId },
    include: { steps: { orderBy: { order: "asc" }, take: 1 } },
  });
  if (!sequence) throw new Error(`Sequence ${sequenceId} not found in workspace`);
  if (sequence.status !== "ACTIVE") {
    // Don't fail the run — operator may activate the sequence later. Log and skip.
    console.warn(`[automation] sequence ${sequenceId} is ${sequence.status} — skip enroll`);
    return;
  }
  if (sequence.steps.length === 0) {
    console.warn(`[automation] sequence ${sequenceId} has no steps — skip enroll`);
    return;
  }

  // Compliance gate — never enroll an unsubscribed/bounced contact.
  const contact = await db.contact.findFirst({
    where: { id: ctx.contact.id, workspaceId: ctx.workspaceId },
    select: { unsubscribedAt: true, bouncedAt: true },
  });
  if (!contact) throw new Error("Contact not found");
  if (contact.unsubscribedAt || contact.bouncedAt) return;

  // Idempotency — partial unique index also enforces this at DB level.
  const existing = await db.contactSequenceEnrollment.findFirst({
    where: { sequenceId, contactId: ctx.contact.id, status: "ACTIVE" },
    select: { id: true },
  });
  if (existing) return;

  const firstDelay = sequence.steps[0].delayMinutes;
  const nextSendAt = new Date(Date.now() + firstDelay * 60_000);

  const [created] = await db.$transaction([
    db.contactSequenceEnrollment.create({
      data: {
        sequenceId,
        contactId: ctx.contact.id,
        workspaceId: ctx.workspaceId,
        status: "ACTIVE",
        currentStepIndex: 0,
        nextSendAt,
        enrolledByAutomationId: ctx.automationId,
        enrolledByRunId: ctx.runId,
      },
      select: { id: true },
    }),
    db.emailSequence.update({
      where: { id: sequenceId },
      data: {
        totalEnrolled: { increment: 1 },
        activeCount: { increment: 1 },
      },
    }),
  ]);

  await db.contactEvent.create({
    data: {
      contactId: ctx.contact.id,
      type: "SEQUENCE_ENROLLED",
      data: { sequenceId, enrollmentId: created.id, source: "automation", automationId: ctx.automationId },
    },
  }).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────
// END_SEQUENCE — remove the trigger contact from a sequence
// ─────────────────────────────────────────────────────────────────
//
// Looks up the contact's ACTIVE enrollment in the configured sequence and
// transitions it to EXITED with reason="automation". No-op if the contact
// isn't enrolled (or already finished/exited) — automations are best-effort.
// To exit from ALL sequences, set actionConfig.sequenceId to "*".

async function execEndSequence(action: ActionRow, ctx: Ctx): Promise<void> {
  if (!ctx.contact) throw new Error("END_SEQUENCE requires a contact");
  const sequenceId = action.actionConfig?.sequenceId as string | undefined;
  if (!sequenceId) throw new Error("END_SEQUENCE missing sequenceId in actionConfig");

  // "*" = exit from ALL active enrollments in this workspace
  const where = sequenceId === "*"
    ? { contactId: ctx.contact.id, workspaceId: ctx.workspaceId, status: "ACTIVE" as const }
    : { sequenceId, contactId: ctx.contact.id, workspaceId: ctx.workspaceId, status: "ACTIVE" as const };

  const enrollments = await db.contactSequenceEnrollment.findMany({
    where,
    select: { id: true, sequenceId: true },
  });
  if (enrollments.length === 0) return;

  const ids = enrollments.map((e) => e.id);
  const perSeqCount = new Map<string, number>();
  for (const e of enrollments) perSeqCount.set(e.sequenceId, (perSeqCount.get(e.sequenceId) ?? 0) + 1);

  await db.$transaction([
    db.contactSequenceEnrollment.updateMany({
      where: { id: { in: ids } },
      data: { status: "EXITED", exitReason: "automation", completedAt: new Date() },
    }),
    ...Array.from(perSeqCount.entries()).map(([sid, count]) =>
      db.emailSequence.update({
        where: { id: sid },
        data: { activeCount: { decrement: count }, exitedCount: { increment: count } },
      })
    ),
    // One ContactEvent per affected sequence — surfaces in the contact's
    // timeline as "Exited from <sequence>" with the automation reason.
    ...Array.from(perSeqCount.keys()).map((sid) =>
      db.contactEvent.create({
        data: {
          contactId: ctx.contact!.id,
          type: "SEQUENCE_EXITED",
          data: { sequenceId: sid, reason: "automation", automationId: ctx.automationId },
        },
      })
    ),
  ]);
}

// ─────────────────────────────────────────────────────────────────
// WEBHOOK
// ─────────────────────────────────────────────────────────────────

async function execWebhook(action: ActionRow, ctx: Ctx): Promise<void> {
  const cfg = action.actionConfig ?? {};
  const url = cfg.url as string | undefined;
  if (!url) throw new Error("WEBHOOK missing url in actionConfig");

  const method = (cfg.method as string | undefined) ?? "POST";
  const customHeaders = (cfg.headers as Record<string, string> | undefined) ?? {};
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Launchtic-Automation/1.0",
    "X-Launchtic-Workspace": ctx.workspaceId,
    "X-Launchtic-Automation": ctx.automationId,
    "X-Launchtic-Run": ctx.runId,
    ...customHeaders,
  };

  const payload = {
    workspaceId: ctx.workspaceId,
    automationId: ctx.automationId,
    runId: ctx.runId,
    contact: ctx.contact,
    trigger: ctx.triggerData,
    sentAt: new Date().toISOString(),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: method === "GET" ? undefined : JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Webhook returned ${res.status}: ${text.slice(0, 200)}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

// ─────────────────────────────────────────────────────────────────

export function createAutomationWorker(): Worker<AutomationRunJobData> {
  const worker = new Worker<AutomationRunJobData>(
    AUTOMATION_QUEUE_NAME,
    processAutomationRun,
    {
      connection: createRedisConnection(),
      concurrency: Number(process.env.AUTOMATION_WORKER_CONCURRENCY ?? 5),
    },
  );

  worker.on("ready", () => console.log(`[automation] worker ready`));
  worker.on("completed", (job, result) =>
    console.log(`[automation] run ${job.data.runId}:`, result),
  );
  worker.on("failed", async (job, err) => {
    console.error(`[automation] run ${job?.data.runId} failed:`, err.message);
    if (job?.data.runId && job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
      await db.automationRun.update({
        where: { id: job.data.runId },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          errorMessage: `Worker error: ${err.message}`.slice(0, 500),
        },
      }).catch(() => {});
    }
  });
  worker.on("error", (err) => console.error("[automation] worker error:", err));

  return worker;
}
