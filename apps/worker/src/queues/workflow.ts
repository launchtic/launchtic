// Workflow state-machine executor.
//
// Each WorkflowRun walks a graph of Nodes one at a time. The worker executes
// the current node, then schedules the NEXT node (immediate or delayed) as
// a separate BullMQ job. A run can take seconds (welcome flow) or weeks
// (re-engagement) — BullMQ's delayed jobs handle the wait, no separate poller.
//
// ─── Graph shape ────────────────────────────────────────────────────────────
//   workflow.nodes : [
//     { id, type: "SEND_EMAIL" | "ADD_TAG" | "REMOVE_TAG" | "WEBHOOK"
//                  | "DELAY"   | "CONDITION" | "END",
//       position: { x, y }, config: {...} }
//   ]
//
// Early-exit pattern: use CONDITION → END for "exit when goal met". The END
// node accepts an optional `config.reason` string that surfaces in
// run.exitReason for analytics (e.g. "purchased" vs natural completion).
//   workflow.edges : [
//     { id, source, target, label?, weight? }
//     // CONDITION node fans out via edge.label === "true" | "false"
//     // SPLIT node fans out via edge.weight (random pick by weight)
//   ]

import { Queue, Worker, type Job } from "bullmq";
import { db } from "@launchtic/database";
import { render, renderEmailContent, buildUnsubscribeUrl } from "@launchtic/email/server";
import { getAppUrl } from "../lib/system-config";
import { createRedisConnection } from "../lib/redis";
import { EMAIL_QUEUE_NAME, type EmailJobData } from "./email";

export const WORKFLOW_QUEUE_NAME = "workflow";

export type WorkflowJobData = {
  runId:       string;
  workspaceId: string;
  // The node to execute on this job. We pass the id explicitly so a stale
  // job (workflow edited mid-flight) is detected by mismatching run.currentNodeId.
  nodeId:      string;
};

// ─── Singleton queue + email queue ──────────────────────────────────────────
// Reuse across jobs — opening/closing Redis connections per email send is
// expensive and was a real perf hit in the legacy automation worker.

const g = globalThis as unknown as {
  __launchtic_workflow_queue?: Queue<WorkflowJobData>;
  __launchtic_email_queue?:    Queue<EmailJobData>;
};

function workflowQueue(): Queue<WorkflowJobData> {
  if (!g.__launchtic_workflow_queue) {
    g.__launchtic_workflow_queue = new Queue<WorkflowJobData>(WORKFLOW_QUEUE_NAME, {
      connection: createRedisConnection(),
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

function emailQueue(): Queue<EmailJobData> {
  if (!g.__launchtic_email_queue) {
    g.__launchtic_email_queue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
      connection: createRedisConnection(),
    });
  }
  return g.__launchtic_email_queue;
}

// ─── Types ──────────────────────────────────────────────────────────────────

type WorkflowNode = {
  id:       string;
  type:     string;
  position?: { x: number; y: number };
  config?:  Record<string, unknown>;
};

type WorkflowEdge = {
  id:     string;
  source: string;
  target: string;
  label?: string;   // "true" / "false" for CONDITION; "accept" / "decline" for branching actions
  weight?: number;  // for SPLIT
};

type RunCtx = {
  runId:        string;
  workspaceId:  string;
  workflowId:   string;
  workspaceName: string;
  // The workflow's trigger type (e.g. "NEW_SALE"). Exposed to WEBHOOK so
  // outbound payloads carry a `type` discriminator the receiver can switch on.
  triggerType:  string;
  contactId:    string | null;
  contact: {
    id:        string;
    email:     string;
    firstName: string | null;
    lastName:  string | null;
  } | null;
  triggerData: Record<string, unknown>;
  context:     Record<string, unknown>;
  // Accumulated context delta to write back at the end of the node. Avoids
  // multiple round-trips when a node updates several fields.
  contextDelta: Record<string, unknown>;
  // What the node returned (for next-step routing).
  nodeOutput:   Record<string, unknown> | null;
  // Edge label preference set by the node executor — drives branching.
  // Eg. CONDITION sets "true"/"false"; SPLIT sets the picked branch id.
  preferredLabel: string | null;
  // If the node decided to terminate the run early (GOAL / END), set this.
  terminate: { status: "COMPLETED" | "EXITED"; reason: string } | null;
};

// ─── Main job processor ─────────────────────────────────────────────────────
//
// Exported for integration tests that exercise the lifecycle gates (run /
// workflow status checks + stale-node defense) without spinning up a real
// BullMQ worker. Production code path is the BullMQ Worker created by
// createWorkflowWorker() below.

export async function processWorkflowJob(job: Job<WorkflowJobData>) {
  const { runId, workspaceId, nodeId } = job.data;

  const run = await db.workflowRun.findFirst({
    where: { id: runId, workspaceId },
    include: {
      workflow: true,
      contact:  { select: { id: true, email: true, firstName: true, lastName: true } },
    },
  });
  if (!run) throw new Error(`WorkflowRun ${runId} not found`);

  // Lifecycle gates — skip any run that's no longer eligible to advance.
  if (run.status !== "ACTIVE") return { skipped: true, reason: `run-status-${run.status}` };
  if (run.workflow.status !== "ACTIVE") {
    // Operator paused / archived the workflow after this job was scheduled.
    // Exit cleanly so we don't keep firing actions for a disabled workflow.
    await exitRun(runId, "EXITED", `workflow_${run.workflow.status.toLowerCase()}`);
    return { skipped: true, reason: `workflow-${run.workflow.status}` };
  }
  // Stale-job defense: the node id we're told to run must match the run's
  // currentNodeId. If the workflow graph was edited and currentNodeId no
  // longer exists, exit gracefully.
  if (run.currentNodeId && run.currentNodeId !== nodeId) {
    return { skipped: true, reason: "stale-node" };
  }

  const nodes = (run.workflow.nodes as unknown as WorkflowNode[]) ?? [];
  const edges = (run.workflow.edges as unknown as WorkflowEdge[]) ?? [];
  const node  = nodes.find((n) => n.id === nodeId);
  if (!node) {
    await exitRun(runId, "FAILED", "node_not_found");
    return { error: "node_not_found", nodeId };
  }

  const workspace = await db.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } });

  const ctx: RunCtx = {
    runId, workspaceId,
    workflowId: run.workflowId,
    workspaceName: workspace?.name ?? "Your Workspace",
    triggerType:  run.workflow.triggerType,
    contactId: run.contactId,
    contact:   run.contact,
    triggerData: (run.triggerData ?? {}) as Record<string, unknown>,
    context:     (run.context     ?? {}) as Record<string, unknown>,
    contextDelta:   {},
    nodeOutput:     null,
    preferredLabel: null,
    terminate:      null,
  };

  // Create RUNNING step row first — so even if executor crashes we have
  // a record of which node was last attempted.
  const step = await db.workflowRunStep.create({
    data: {
      runId, nodeId, nodeType: node.type, status: "RUNNING",
    },
  });

  let stepStatus: "COMPLETED" | "FAILED" | "SKIPPED" = "COMPLETED";
  let stepError: string | null = null;
  try {
    await executeNode(node, ctx, edges);
  } catch (err) {
    stepStatus = "FAILED";
    stepError  = err instanceof Error ? err.message : "Unknown error";
    console.error(`[workflow] run ${runId} node ${nodeId} (${node.type}) failed:`, stepError);
    // Per-node failure does NOT abort the run by default. Mark step FAILED
    // and continue routing to the next node — same best-effort posture as
    // the legacy automation worker. Operators get the error in the run
    // timeline + step.error so they can debug.
  }

  await db.workflowRunStep.update({
    where: { id: step.id },
    data:  { status: stepStatus, completedAt: new Date(), error: stepError?.slice(0, 1000), output: (ctx.nodeOutput as any) ?? undefined },
  });

  // Merge context delta back to run.
  const updatedContext = { ...ctx.context, ...ctx.contextDelta };

  // Did the node terminate the run?
  if (ctx.terminate) {
    await db.workflowRun.update({
      where: { id: runId },
      data: {
        status:        ctx.terminate.status,
        exitReason:    ctx.terminate.reason,
        completedAt:   new Date(),
        currentNodeId: null,
        scheduledFor:  null,
        context:       updatedContext as any,
      },
    });
    await bumpWorkflowCounter(run.workflowId, ctx.terminate.status === "COMPLETED" ? "completedCount" : "exitedCount");
    return { terminated: ctx.terminate };
  }

  // Pick the next edge to follow.
  const next = pickNextEdge(nodeId, edges, ctx.preferredLabel);
  if (!next) {
    // No outgoing edge → workflow finished naturally.
    await db.workflowRun.update({
      where: { id: runId },
      data: {
        status:        "COMPLETED",
        completedAt:   new Date(),
        currentNodeId: null,
        scheduledFor:  null,
        context:       updatedContext as any,
      },
    });
    await bumpWorkflowCounter(run.workflowId, "completedCount");
    return { completed: true };
  }

  // Delay scheduling: a DELAY node sets contextDelta.__delayMs to tell us
  // how long to wait BEFORE the next node fires. Everything else fires
  // immediately.
  const delayMs = typeof ctx.contextDelta.__delayMs === "number" ? ctx.contextDelta.__delayMs : 0;
  const scheduledFor = delayMs > 0 ? new Date(Date.now() + delayMs) : null;
  // Don't leak the delay marker into persistent context.
  delete (updatedContext as Record<string, unknown>).__delayMs;

  await db.workflowRun.update({
    where: { id: runId },
    data: {
      currentNodeId: next.target,
      scheduledFor,
      context:       updatedContext as any,
    },
  });

  await workflowQueue().add(
    "step",
    { runId, workspaceId, nodeId: next.target },
    delayMs > 0 ? { delay: delayMs } : undefined,
  );

  return { nextNodeId: next.target, delayMs };
}

// ─── Edge routing ───────────────────────────────────────────────────────────
//
// CONDITION node: executor sets ctx.preferredLabel = "true" | "false" — we
// pick the outgoing edge whose `label` matches. If none matches we fall back
// to the first unlabeled edge ("default" branch).
//
// SPLIT node: executor sets ctx.preferredLabel = picked branch id from
// weighted random — same matching strategy.
//
// Other nodes: take the first outgoing edge.

function pickNextEdge(fromNodeId: string, edges: WorkflowEdge[], preferredLabel: string | null): WorkflowEdge | null {
  const outgoing = edges.filter((e) => e.source === fromNodeId);
  if (outgoing.length === 0) return null;
  if (preferredLabel) {
    const labeled = outgoing.find((e) => e.label === preferredLabel);
    if (labeled) return labeled;
    const unlabeled = outgoing.find((e) => !e.label);
    return unlabeled ?? outgoing[0];
  }
  return outgoing[0];
}

// ─── Node executor dispatcher ───────────────────────────────────────────────

async function executeNode(node: WorkflowNode, ctx: RunCtx, _edges: WorkflowEdge[]): Promise<void> {
  switch (node.type) {
    case "SEND_EMAIL":   return execSendEmail(node, ctx);
    case "ADD_TAG":      return execAddTag(node, ctx);
    case "REMOVE_TAG":   return execRemoveTag(node, ctx);
    case "ADD_TO_PIPELINE": return execAddToPipeline(node, ctx);
    case "WEBHOOK":      return execWebhook(node, ctx);
    case "DELAY":        return execDelay(node, ctx);
    case "CONDITION":    return execCondition(node, ctx);
    case "END":          return execEnd(node, ctx);
    default:
      throw new Error(`Unknown node type: ${node.type}`);
  }
}

// ─── SEND_EMAIL ─────────────────────────────────────────────────────────────

async function execSendEmail(node: WorkflowNode, ctx: RunCtx): Promise<void> {
  if (!ctx.contact) throw new Error("SEND_EMAIL requires a contact in the run context");

  // Content lives in WorkflowEmail (separate table). The node's config only
  // carries an `emailId` reference. Pre-flight validation should have caught
  // a missing id; throw here as a safety net so the step lands FAILED with
  // a clear reason instead of silently sending blank content.
  const cfg = (node.config ?? {}) as Record<string, unknown>;
  const emailId = cfg.emailId as string | undefined;
  if (!emailId) {
    throw new Error("SEND_EMAIL missing emailId — pick or create an email for this step");
  }

  const email = await db.workflowEmail.findUnique({
    where: { id: emailId },
    select: {
      workflowId: true,
      // `name` + parent workflow name are joined so the EmailSend row can
      // snapshot a "WorkflowName · EmailName" sourceLabel at send time.
      // Survives both workflow rename and workflow delete in the logs UI.
      name:       true,
      workflow:   { select: { name: true } },
      subject:    true, bodyHtml: true,
      fromName:   true, fromEmail: true,
    },
  });
  if (!email) throw new Error(`SEND_EMAIL email ${emailId} not found`);
  if (email.workflowId !== ctx.workflowId) {
    throw new Error(`SEND_EMAIL email ${emailId} doesn't belong to this workflow`);
  }
  const { subject, bodyHtml, fromName, fromEmail } = email;
  if (!subject || !bodyHtml || !fromEmail || !fromName) {
    throw new Error("SEND_EMAIL: linked WorkflowEmail is missing subject / body / sender");
  }

  const c = ctx.contact;
  const firstName = c.firstName ?? "";
  const lastName  = c.lastName  ?? "";
  const fullName  = [firstName, lastName].filter(Boolean).join(" ").trim() || c.email;
  const appUrl    = await getAppUrl();
  const vars = {
    contact: { firstName, lastName, email: c.email, fullName },
    workspace: { name: ctx.workspaceName },
    order: ctx.triggerData.order ?? {},
    unsubscribeUrl: buildUnsubscribeUrl(c.id, appUrl),
    ...ctx.triggerData,
    ...ctx.context,
  };

  const renderedSubject = render(subject, vars);
  const renderedHtml    = await renderEmailContent(bodyHtml, vars, appUrl);

  // Persist EmailSend FIRST then enqueue — if enqueue fails we mark the
  // send FAILED so it's not stuck QUEUED forever. The generic source columns
  // (Pattern B) snapshot WHERE this send came from at send time:
  //   sourceType   = "WORKFLOW"
  //   sourceId     = emailId — used by workflow CONDITION executor to filter
  //                  "did this contact open/click email X" via the index
  //                  (contactId, sourceType, sourceId, openedAt/clickedAt).
  //   sourceLabel  = "WorkflowName · EmailName" — survives source rename/delete
  //                  for the logs UI audit trail.
  const send = await db.emailSend.create({
    data: {
      workspaceId: ctx.workspaceId,
      contactId:   c.id,
      toEmail:     c.email,
      subject:     renderedSubject,
      bodyHtml:    renderedHtml,
      status:      "QUEUED",
      sourceType:  "WORKFLOW",
      sourceId:    emailId,
      sourceLabel: `${email.workflow.name} · ${email.name || subject || "(untitled)"}`,
    },
  });

  // Bump the WorkflowEmail's denormalized sent counter — best-effort, never
  // fail the send if the counter update errors.
  await db.workflowEmail.update({
    where: { id: emailId },
    data:  { sentCount: { increment: 1 } },
  }).catch(() => {});

  try {
    await emailQueue().add("send", {
      emailSendId: send.id,
      workspaceId: ctx.workspaceId,
      contactId:   c.id,
      to:          c.email,
      subject:     renderedSubject,
      html:        renderedHtml,
      fromEmail,
      fromName,
    });
    ctx.nodeOutput = { emailSendId: send.id };
  } catch (err) {
    await db.emailSend.update({
      where: { id: send.id },
      data:  { status: "FAILED", errorMessage: err instanceof Error ? err.message : "enqueue failed" },
    }).catch(() => {});
    throw err;
  }
}

// ─── ADD_TAG / REMOVE_TAG ───────────────────────────────────────────────────

async function execAddTag(node: WorkflowNode, ctx: RunCtx): Promise<void> {
  if (!ctx.contact) throw new Error("ADD_TAG requires a contact");
  const tagId = (node.config?.tagId as string | undefined)?.trim();
  if (!tagId) throw new Error("ADD_TAG missing tagId");

  const tag = await db.tag.findFirst({ where: { id: tagId, workspaceId: ctx.workspaceId } });
  if (!tag) throw new Error(`Tag ${tagId} not found in workspace`);

  await db.contactTag.upsert({
    where: { contactId_tagId: { contactId: ctx.contact.id, tagId } },
    create: { contactId: ctx.contact.id, tagId },
    update: {},
  });
  await db.contactEvent.create({
    data: {
      contactId: ctx.contact.id, type: "TAG_ADDED",
      data: { tagId, source: "workflow", workflowId: ctx.workflowId, runId: ctx.runId },
    },
  });
  ctx.nodeOutput = { tagId };
}

async function execRemoveTag(node: WorkflowNode, ctx: RunCtx): Promise<void> {
  if (!ctx.contact) throw new Error("REMOVE_TAG requires a contact");
  const tagId = (node.config?.tagId as string | undefined)?.trim();
  if (!tagId) throw new Error("REMOVE_TAG missing tagId");

  await db.contactTag
    .delete({ where: { contactId_tagId: { contactId: ctx.contact.id, tagId } } })
    .catch(() => {});  // idempotent
  await db.contactEvent.create({
    data: {
      contactId: ctx.contact.id, type: "TAG_REMOVED",
      data: { tagId, source: "workflow", workflowId: ctx.workflowId, runId: ctx.runId },
    },
  });
  ctx.nodeOutput = { tagId };
}

// ─── ADD_TO_PIPELINE ────────────────────────────────────────────────────────

// Add or move the contact to a pipeline stage. A contact sits on at most one
// stage per pipeline, so an existing card is moved rather than duplicated.
async function execAddToPipeline(node: WorkflowNode, ctx: RunCtx): Promise<void> {
  if (!ctx.contact) throw new Error("ADD_TO_PIPELINE requires a contact");
  const cfg = (node.config ?? {}) as Record<string, unknown>;
  const pipelineId = (cfg.pipelineId as string | undefined)?.trim();
  const stageId    = (cfg.stageId    as string | undefined)?.trim();
  if (!pipelineId) throw new Error("ADD_TO_PIPELINE missing pipelineId");
  if (!stageId)    throw new Error("ADD_TO_PIPELINE missing stageId");

  // Stage must belong to the given pipeline AND this workspace.
  const stage = await db.pipelineStage.findFirst({
    where: { id: stageId, pipelineId, pipeline: { workspaceId: ctx.workspaceId } },
    select: { id: true, name: true, pipeline: { select: { name: true } } },
  });
  if (!stage) throw new Error(`Pipeline stage ${stageId} not found in workspace`);

  const contactId = ctx.contact.id;
  const existing = await db.pipelineCard.findFirst({
    where: { contactId, stage: { pipelineId } },
    select: { id: true, stageId: true },
  });

  const last = await db.pipelineCard.findFirst({
    where: { stageId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const position = (last?.position ?? -1) + 1;

  let cardId: string;
  let changed = true;
  if (existing) {
    if (existing.stageId === stageId) {
      cardId = existing.id; // already on this stage — no-op move
      changed = false;
    } else {
      const card = await db.pipelineCard.update({
        where: { id: existing.id },
        data: { stageId, position },
        select: { id: true },
      });
      cardId = card.id;
    }
  } else {
    const card = await db.pipelineCard.create({
      data: { stageId, contactId, position },
      select: { id: true },
    });
    cardId = card.id;
  }

  // Log the milestone on the contact timeline (only on a real add/move).
  if (changed) {
    await db.contactEvent.create({
      data: {
        contactId,
        type: "PIPELINE_STAGE_CHANGED",
        data: {
          pipelineId,
          pipelineName: stage.pipeline.name,
          stageId,
          stageName: stage.name,
          source: "workflow",
          workflowId: ctx.workflowId,
          runId: ctx.runId,
        },
      },
    });
  }

  ctx.nodeOutput = { pipelineId, stageId, cardId };
}

// ─── WEBHOOK ────────────────────────────────────────────────────────────────

// Accepts the on-disk shape (array of [key, value]) used by the builder UI as
// well as the legacy object form, so existing workflows that may have set
// headers via API don't break. Invalid entries (non-string, empty key) are
// dropped silently — they were rejected by the pre-flight validator anyway.
function buildCustomHeadersObject(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!Array.isArray(entry) || entry.length !== 2) continue;
      const k = typeof entry[0] === "string" ? entry[0].trim() : "";
      const v = typeof entry[1] === "string" ? entry[1] : "";
      if (k && v) out[k] = v;
    }
  } else if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "string" && k.trim()) out[k.trim()] = v;
    }
  }
  return out;
}

async function execWebhook(node: WorkflowNode, ctx: RunCtx): Promise<void> {
  const cfg = (node.config ?? {}) as Record<string, unknown>;
  const url = cfg.url as string | undefined;
  if (!url) throw new Error("WEBHOOK missing url");

  const method = (cfg.method as string | undefined) ?? "POST";

  // Headers are stored as an array of [key, value] tuples so the UI preserves
  // insertion order; convert to the object shape that fetch() expects. Custom
  // headers are spread LAST so the operator can override our X-Launchtic-*
  // defaults if they need to (e.g. some receivers require a different
  // User-Agent for allowlist reasons).
  //
  // SECURITY NOTE: header values are stored in plaintext inside the workflow's
  // nodes JSON. Bearer tokens / API keys live unencrypted at-rest until we add
  // a workspace-scoped secret vault. Track this when granting workspace access.
  const customHeaders = buildCustomHeadersObject(cfg.headers);
  const headers: Record<string, string> = {
    "Content-Type":            "application/json",
    "User-Agent":              "Launchtic-Workflow/1.0",
    "X-Launchtic-Workspace":   ctx.workspaceId,
    "X-Launchtic-Workflow":    ctx.workflowId,
    "X-Launchtic-Run":         ctx.runId,
    "X-Launchtic-Node":        node.id,
    ...customHeaders,
  };

  // Systeme-style envelope. The `type` discriminator lets the receiver switch
  // on which trigger fired this webhook (e.g. "new_sale" vs "form_submit")
  // when the same endpoint handles multiple workflows. The workflow's own
  // identifiers live under `data` so the envelope stays stable across triggers.
  const payload = {
    type:        ctx.triggerType.toLowerCase(),
    workspaceId: ctx.workspaceId,
    data: {
      workflowId: ctx.workflowId,
      runId:      ctx.runId,
      nodeId:     node.id,
      contact:    ctx.contact,
      trigger:    ctx.triggerData,
      context:    ctx.context,
    },
    sentAt: new Date().toISOString(),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      method, headers,
      body: method === "GET" ? undefined : JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Webhook returned ${res.status}: ${text.slice(0, 200)}`);
    }
    ctx.nodeOutput = { status: res.status };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── DELAY ──────────────────────────────────────────────────────────────────
//
// Sets ctx.contextDelta.__delayMs — the dispatcher reads it and schedules
// the next job with that delay. The delay itself doesn't block the worker.

async function execDelay(node: WorkflowNode, ctx: RunCtx): Promise<void> {
  const cfg     = (node.config ?? {}) as Record<string, unknown>;
  const minutes = Number(cfg.minutes ?? cfg.delayMinutes ?? 0);
  const hours   = Number(cfg.hours   ?? 0);
  const days    = Number(cfg.days    ?? 0);
  const totalMs = (((days * 24) + hours) * 60 + minutes) * 60_000;
  if (totalMs <= 0) {
    // Zero-delay is allowed (no-op) — useful for builder placeholders.
    return;
  }
  ctx.contextDelta.__delayMs = totalMs;
  ctx.nodeOutput = { delayMs: totalMs };
}

// ─── CONDITION ──────────────────────────────────────────────────────────────
//
// Evaluates `node.config` against the run context + contact and sets
// ctx.preferredLabel = "true" | "false" for edge routing.
//
// Supported kinds:
//   "contact_tag"        → { tagId, operator: "has"|"does_not_have" }
//   "contact_field"      → { field, operator, value }
//   "contact_purchased"  → { funnelStepId? }  — checks Order.PAID since run started
//   "email_opened"       → { source, broadcastId?, workflowEmailId? }
//                          source = "broadcast" | "workflow_email"
//                          checks EmailSend.openedAt >= run.startedAt
//   "email_clicked"      → same shape, checks EmailSend.clickedAt >= run.startedAt

async function execCondition(node: WorkflowNode, ctx: RunCtx): Promise<void> {
  const cfg  = (node.config ?? {}) as Record<string, unknown>;
  const kind = cfg.kind as string | undefined;
  let result = false;

  switch (kind) {
    case "contact_purchased": {
      // True if the contact has a PAID Order at the trigger's funnelStepId
      // created AFTER this run started. Used by cart-abandonment GOAL nodes
      // to exit when the buyer completes their order during the recovery
      // window so we don't send "did you forget?" after they've checked out.
      if (!ctx.contactId) { result = false; break; }
      const stepId = (cfg.funnelStepId as string | undefined) ?? (ctx.triggerData.funnelStepId as string | undefined);
      const run = await db.workflowRun.findUnique({
        where:  { id: ctx.runId },
        select: { startedAt: true },
      });
      const since = run?.startedAt ?? new Date(0);
      const order = await db.order.findFirst({
        where: {
          contactId:   ctx.contactId,
          status:      "PAID",
          createdAt:   { gte: since },
          ...(stepId ? { funnelStepId: stepId } : {}),
        },
        select: { id: true },
      });
      result = !!order;
      break;
    }
    case "contact_tag": {
      if (!ctx.contact) { result = false; break; }
      const tagId    = cfg.tagId    as string | undefined;
      const operator = (cfg.operator as string | undefined) ?? "has";
      if (!tagId) { result = false; break; }
      const ct = await db.contactTag.findUnique({
        where: { contactId_tagId: { contactId: ctx.contact.id, tagId } },
      });
      // "has"          → true if tag present.
      // "does_not_have" → true if tag absent. Lets workflows route a "false"
      //                   branch as "true" without flipping edge labels.
      result = operator === "does_not_have" ? !ct : !!ct;
      break;
    }
    case "contact_field": {
      if (!ctx.contact) { result = false; break; }
      const field    = cfg.field as string | undefined;
      const operator = (cfg.operator as string | undefined) ?? "equals";
      const value    = cfg.value;
      const actual   = field ? (ctx.contact as any)[field] : undefined;
      result = compareString(actual, operator, value);
      break;
    }
    case "email_opened":
    case "email_clicked": {
      // True if the contact opened/clicked an email matching the configured
      // source filter, with engagement timestamp >= run.startedAt.
      //   source="broadcast"      → matches sends with sourceType=BROADCAST  + sourceId=X
      //   source="workflow_email" → matches sends with sourceType=WORKFLOW   + sourceId=X
      // Under Pattern B the (contactId, sourceType, sourceId, openedAt/clickedAt)
      // composite indexes cover this query — same selectivity as the old
      // (contactId, broadcastId/workflowEmailId, *) indexes.
      if (!ctx.contact) { result = false; break; }
      const source = cfg.source as string | undefined;
      const where: Record<string, unknown> = { contactId: ctx.contact.id };
      if (source === "broadcast") {
        const broadcastId = cfg.broadcastId as string | undefined;
        if (!broadcastId) { result = false; break; }
        where.sourceType = "BROADCAST";
        where.sourceId   = broadcastId;
      } else if (source === "workflow_email") {
        const workflowEmailId = cfg.workflowEmailId as string | undefined;
        if (!workflowEmailId) { result = false; break; }
        where.sourceType = "WORKFLOW";
        where.sourceId   = workflowEmailId;
      } else {
        // Missing or unsupported source — fail closed so a misconfigured
        // condition routes to the "false" branch rather than ANY-emailing.
        result = false;
        break;
      }
      const run = await db.workflowRun.findUnique({
        where:  { id: ctx.runId },
        select: { startedAt: true },
      });
      const since = run?.startedAt ?? new Date(0);
      const dateField = kind === "email_opened" ? "openedAt" : "clickedAt";
      where[dateField] = { gte: since };
      const send = await db.emailSend.findFirst({ where, select: { id: true } });
      result = !!send;
      break;
    }
    default:
      throw new Error(`CONDITION: unsupported kind "${kind ?? "(unset)"}"`);
  }

  ctx.preferredLabel = result ? "true" : "false";
  ctx.nodeOutput     = { evaluated: result, kind };
}

// String-only comparison for `contact_field`. Profile fields in launchtic are
// all strings (email, firstName, lastName, phone, country, company) so 4
// operators cover the realistic use cases — matching Systeme.io's UX.
function compareString(actual: unknown, operator: string, value: unknown): boolean {
  const a = String(actual ?? "").toLowerCase();
  const b = String(value  ?? "").toLowerCase();
  switch (operator) {
    case "equals":   return a === b;
    case "begins":   return a.startsWith(b);
    case "contains": return a.includes(b);
    case "ends":     return a.endsWith(b);
    default:         return false;
  }
}

// ─── END ────────────────────────────────────────────────────────────────────
//
// Terminates the run with status=COMPLETED. The optional `config.reason`
// string is surfaced as `run.exitReason` so analytics can distinguish between
// natural completion ("end_node") and early-exit branches like "purchased"
// or "subscribed" wired off a CONDITION's true edge.

async function execEnd(node: WorkflowNode, ctx: RunCtx): Promise<void> {
  const reason = (node.config?.reason as string | undefined)?.trim() || "end_node";
  ctx.terminate = { status: "COMPLETED", reason };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function exitRun(runId: string, status: "EXITED" | "COMPLETED" | "FAILED", reason: string) {
  await db.workflowRun.update({
    where: { id: runId },
    data: {
      status, exitReason: reason,
      completedAt: new Date(),
      currentNodeId: null,
      scheduledFor:  null,
    },
  }).catch(() => {});
}

async function bumpWorkflowCounter(
  workflowId: string,
  field: "completedCount" | "exitedCount" | "failedCount" | "activeCount",
) {
  await db.workflow.update({
    where: { id: workflowId },
    data:  { [field]: { increment: 1 }, ...(field !== "activeCount" ? { activeCount: { decrement: 1 } } : {}) },
  }).catch(() => {});
}

// ─── Worker factory ─────────────────────────────────────────────────────────

export function createWorkflowWorker(): Worker<WorkflowJobData> {
  const worker = new Worker<WorkflowJobData>(
    WORKFLOW_QUEUE_NAME,
    processWorkflowJob,
    {
      connection: createRedisConnection(),
      concurrency: Number(process.env.WORKFLOW_WORKER_CONCURRENCY ?? 8),
    },
  );
  worker.on("ready",     () => console.log(`[workflow] worker ready`));
  worker.on("completed", (job, result) => console.log(`[workflow] run ${job.data.runId} node ${job.data.nodeId}:`, result));
  worker.on("failed",    (job, err)    => console.error(`[workflow] run ${job?.data.runId} node ${job?.data.nodeId} failed:`, err.message));
  worker.on("error",     (err)         => console.error(`[workflow] worker error:`, err));
  return worker;
}

// ─── Public API: enqueue first step of a new run ────────────────────────────

export async function scheduleFirstStep(runId: string, workspaceId: string, nodeId: string) {
  await workflowQueue().add("step", { runId, workspaceId, nodeId });
}
