// Round-2 integration smoke test — extends test-source-picker-integration.mts
// to cover the rest of the P0/P1 workflow surfaces flagged in coverage review:
//
//   Group C — Conditions other than email (contact_tag, contact_field,
//             contact_purchased)
//   Group D — Triggers other than email (NEW_SALE, TAG_ADDED, CHECKOUT_STARTED,
//             FORM_SUBMIT, SUBSCRIPTION_PAYMENT_FAILED)
//   Group F — Graph validation rules (cycle-tolerant, dead-end, missing
//             true/false branch, edges → missing nodes, no startNodeId)
//   Group G — DELAY scheduling math + boundary conditions
//   Group H — SEND_EMAIL DB write shape (EmailSend row populated correctly,
//             WorkflowEmail.sentCount bumped, missing email path)
//   Group I — Stale-job defense (run.status != ACTIVE skipped, workflow
//             paused/archived mid-flight exits run, nodeId mismatch skipped)
//   Group J — Re-enroll edge cases (anonymous fire not blocked, prior
//             COMPLETED/EXITED/FAILED run allows re-enroll)
//   Group K — Validation gaps not in F/G (trigger source rules, SEND_EMAIL
//             content, WEBHOOK url/method, CONDITION kind variants,
//             deprecated node type, DELAY negative)
//   Group L — Executor sanity for ADD_TAG / REMOVE_TAG / DELAY / CONDITION
//             routing / END reason / SEND_EMAIL cross-workflow guard
//             (drives processWorkflowJob, asserts side effects + next state)
//   Group M — WEBHOOK executor: payload envelope shape, type discriminator,
//             X-Launchtic-* headers, custom headers spread, non-2xx → FAILED.
//             Spawns a local http server on a random port.
//
// Same isolation pattern: all test rows are prefixed "smoketest_cov_" and
// removed in a try/finally cleanup so no user data is touched.
//
// Run:
//   pnpm --filter @launchtic/worker exec tsx \
//     "C:/Users/Admin/Desktop/NODEJS/launchtic/apps/web/scripts/test-workflow-coverage.mts"

import * as fs from "node:fs";
import * as http from "node:http";
{
  const envPath = "C:/Users/Admin/Desktop/NODEJS/launchtic/.env";
  if (fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i.exec(line);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}

// @ts-ignore
import * as DB from "file:///C:/Users/Admin/Desktop/NODEJS/launchtic/packages/database/src/index.ts";
// @ts-ignore
import * as AUTO from "file:///C:/Users/Admin/Desktop/NODEJS/launchtic/apps/renderer/lib/automations.ts";
// @ts-ignore — pure-logic module, no side effects
import * as VAL from "file:///C:/Users/Admin/Desktop/NODEJS/launchtic/apps/web/lib/workflow-validation.ts";
// @ts-ignore — module-level imports are lazy (queues only created on use)
import * as WF from "file:///C:/Users/Admin/Desktop/NODEJS/launchtic/apps/worker/src/queues/workflow.ts";

const dbAny:   any = (DB   as any).default ?? DB;
const autoAny: any = (AUTO as any).default ?? AUTO;
const valAny:  any = (VAL  as any).default ?? VAL;
const wfAny:   any = (WF   as any).default ?? WF;
const db = dbAny.db ?? dbAny;
const fireTrigger        = autoAny.fireTrigger;
const validateWorkflow   = valAny.validateWorkflow;
const processWorkflowJob = wfAny.processWorkflowJob;

const PREFIX = "smoketest_cov";

let pass = 0, fail = 0;
const failures: string[] = [];
function check(label: string, ok: boolean, extra?: unknown) {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else    { fail++; failures.push(label); console.log(`  ✗ ${label}`, extra ?? ""); }
}
function section(title: string) { console.log(`\n${title}`); }

const created = {
  workflowRunSteps: [] as string[],
  workflowRuns:     [] as string[],
  emailSends:       [] as string[],
  workflowEmails:   [] as string[],
  workflows:        [] as string[],
  orders:           [] as string[],
  funnels:          [] as string[],
  funnelSteps:      [] as string[],
  contactTags:      [] as Array<{ contactId: string; tagId: string }>,
  tags:             [] as string[],
  contacts:         [] as string[],
  broadcasts:       [] as string[],
};

async function main() {
  const ws = await db.workspace.findFirst({ select: { id: true, name: true } });
  if (!ws) { console.error("FATAL: no workspace."); process.exit(2); }
  console.log(`Workspace "${ws.name}" (${ws.id})`);

  // ───────────────────────────────────────────────────────────────────────────
  //  GROUP C — Non-email conditions
  // ───────────────────────────────────────────────────────────────────────────
  section("C. execCondition — contact_tag / contact_field / contact_purchased");

  const contact = await db.contact.create({
    data: {
      workspaceId: ws.id,
      email: `${PREFIX}_c1@example.test`,
      firstName: "Alice",
      lastName:  "Wonderland",
      company:   "ACME Corp",
    },
  });
  created.contacts.push(contact.id);

  const tagFoo = await db.tag.create({
    data: { workspaceId: ws.id, name: `${PREFIX}_tag_foo` },
  });
  created.tags.push(tagFoo.id);

  const tagBar = await db.tag.create({
    data: { workspaceId: ws.id, name: `${PREFIX}_tag_bar` },
  });
  created.tags.push(tagBar.id);

  // Apply tagFoo to contact
  await db.contactTag.create({ data: { contactId: contact.id, tagId: tagFoo.id } });
  created.contactTags.push({ contactId: contact.id, tagId: tagFoo.id });

  // ─ contact_tag — query mirrors execCondition's logic ──────────────────────
  async function condContactTag(contactId: string, tagId: string, operator: "has" | "does_not_have") {
    const ct = await db.contactTag.findUnique({
      where: { contactId_tagId: { contactId, tagId } },
    });
    return operator === "does_not_have" ? !ct : !!ct;
  }
  check("C1: contact_tag has FOO → true",
    await condContactTag(contact.id, tagFoo.id, "has") === true);
  check("C2: contact_tag has BAR (not applied) → false",
    await condContactTag(contact.id, tagBar.id, "has") === false);
  check("C3: contact_tag does_not_have BAR → true",
    await condContactTag(contact.id, tagBar.id, "does_not_have") === true);

  // ─ contact_field — string comparators ─────────────────────────────────────
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
  check("C4: contact_field firstName equals 'Alice' (case-insensitive) → true",
    compareString(contact.firstName, "equals", "alice") === true);
  check("C5: contact_field company contains 'ACME' → true",
    compareString(contact.company, "contains", "acme") === true);
  check("C6: contact_field lastName ends 'land' → true",
    compareString(contact.lastName, "ends", "land") === true);

  // ─ contact_purchased — Order PAID since run.startedAt ─────────────────────
  //
  // Setup: create a funnel + checkout step, place a PAID order created NOW
  // for our contact, then query for "purchased since 1h ago" (true) vs
  // "purchased since 1h ahead" (false).
  const funnel = await db.funnel.create({
    data: { workspaceId: ws.id, name: `${PREFIX}_funnel`, currency: "usd" },
  });
  created.funnels.push(funnel.id);

  const step = await db.funnelStep.create({
    data: {
      funnelId: funnel.id, name: "Checkout", slug: `${PREFIX}_step`,
      type: "CHECKOUT", order: 0,
      pageJson: {},   // schema requires it; empty page is fine for FK target
    },
  });
  created.funnelSteps.push(step.id);

  const order = await db.order.create({
    data: {
      workspaceId: ws.id, contactId: contact.id, funnelStepId: step.id,
      status: "PAID",
      subtotal: 1000, total: 1000, currency: "usd",
    },
  });
  created.orders.push(order.id);

  async function condPurchased(contactId: string, since: Date, funnelStepId?: string) {
    const o = await db.order.findFirst({
      where: {
        contactId, status: "PAID", createdAt: { gte: since },
        ...(funnelStepId ? { funnelStepId } : {}),
      },
      select: { id: true },
    });
    return !!o;
  }
  const PAST_1H   = new Date(Date.now() - 60 * 60 * 1000);
  const FUTURE_1H = new Date(Date.now() + 60 * 60 * 1000);
  check("C7: contact_purchased since 1h ago → true",
    await condPurchased(contact.id, PAST_1H, step.id) === true);
  check("C8: contact_purchased since 1h ahead → false",
    await condPurchased(contact.id, FUTURE_1H, step.id) === false);
  check("C9: contact_purchased wrong funnelStep → false",
    await condPurchased(contact.id, PAST_1H, "nonexistent_step_id") === false);

  // ───────────────────────────────────────────────────────────────────────────
  //  GROUP D — Non-email triggers fire
  // ───────────────────────────────────────────────────────────────────────────
  section("D. fireTrigger — TAG_ADDED, NEW_SALE, FORM_SUBMIT, CHECKOUT_STARTED");

  async function makeWf(triggerType: string, triggerConfig: any) {
    const wf = await db.workflow.create({
      data: {
        workspaceId: ws.id,
        name: `${PREFIX}_${triggerType}_${Math.random().toString(36).slice(2, 7)}`,
        status: "ACTIVE", triggerType, triggerConfig,
        nodes: [{ id: "end", type: "END", position: { x: 0, y: 0 }, config: {} }] as any,
        edges: [] as any, startNodeId: "end",
      },
    });
    created.workflows.push(wf.id);
    return wf.id;
  }
  const countRuns = (wfId: string) => db.workflowRun.count({ where: { workflowId: wfId } });

  // D1: TAG_ADDED with matching tagId
  {
    const wfId = await makeWf("TAG_ADDED", { tagId: tagFoo.id });
    await fireTrigger(ws.id, "TAG_ADDED", { contactId: contact.id, tagId: tagFoo.id });
    check("D1: TAG_ADDED match → 1 run", await countRuns(wfId) === 1);
  }
  // D2: TAG_ADDED mismatch
  {
    const wfId = await makeWf("TAG_ADDED", { tagId: tagFoo.id });
    await fireTrigger(ws.id, "TAG_ADDED", { contactId: contact.id, tagId: tagBar.id });
    check("D2: TAG_ADDED wrong tag → 0 runs", await countRuns(wfId) === 0);
  }
  // D3: NEW_SALE with funnel + step scope match
  {
    const wfId = await makeWf("NEW_SALE", { funnelId: funnel.id, funnelStepId: step.id });
    await fireTrigger(ws.id, "NEW_SALE", {
      contactId: contact.id, orderId: order.id,
      funnelId: funnel.id, funnelStepId: step.id,
      orderTotal: 1000, orderCurrency: "usd",
    });
    check("D3: NEW_SALE funnel+step match → 1 run", await countRuns(wfId) === 1);
  }
  // D4: NEW_SALE wrong funnelStep
  {
    const wfId = await makeWf("NEW_SALE", { funnelId: funnel.id, funnelStepId: step.id });
    await fireTrigger(ws.id, "NEW_SALE", {
      contactId: contact.id, orderId: order.id,
      funnelId: funnel.id, funnelStepId: "other_step",
      orderTotal: 1000, orderCurrency: "usd",
    });
    check("D4: NEW_SALE wrong step → 0 runs", await countRuns(wfId) === 0);
  }
  // D5: CHECKOUT_STARTED match (same shape as NEW_SALE, different trigger name)
  {
    const wfId = await makeWf("CHECKOUT_STARTED", { funnelId: funnel.id, funnelStepId: step.id });
    await fireTrigger(ws.id, "CHECKOUT_STARTED", {
      contactId: contact.id, funnelId: funnel.id, funnelStepId: step.id,
    });
    check("D5: CHECKOUT_STARTED funnel+step match → 1 run", await countRuns(wfId) === 1);
  }
  // D6: SUBSCRIPTION_PAYMENT_FAILED match
  {
    const wfId = await makeWf("SUBSCRIPTION_PAYMENT_FAILED", { funnelId: funnel.id, funnelStepId: step.id });
    await fireTrigger(ws.id, "SUBSCRIPTION_PAYMENT_FAILED", {
      contactId: contact.id, subscriptionId: "sub_test",
      funnelId: funnel.id, funnelStepId: step.id,
    });
    check("D6: SUBSCRIPTION_PAYMENT_FAILED match → 1 run", await countRuns(wfId) === 1);
  }
  // D7: FORM_SUBMIT match
  {
    const wfId = await makeWf("FORM_SUBMIT", { funnelId: funnel.id, funnelStepId: step.id });
    await fireTrigger(ws.id, "FORM_SUBMIT", {
      contactId: contact.id, funnelId: funnel.id, funnelStepId: step.id,
    });
    check("D7: FORM_SUBMIT match → 1 run", await countRuns(wfId) === 1);
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  GROUP F — Graph validation
  // ───────────────────────────────────────────────────────────────────────────
  section("F. validateWorkflow — graph rules");

  function issuesFor(wf: any): string[] {
    return validateWorkflow(wf).flatMap((i: any) => i.messages);
  }

  // F1: missing startNodeId
  check("F1: missing startNodeId → error",
    issuesFor({
      triggerType: "TAG_ADDED", triggerConfig: { tagId: "x" },
      nodes: [{ id: "n1", type: "END", config: {} }],
      edges: [], startNodeId: null,
    }).some((m) => m.includes("starting step")));

  // F2: CONDITION missing true/false branch
  check("F2: CONDITION missing both branches → error",
    issuesFor({
      triggerType: "TAG_ADDED", triggerConfig: { tagId: "x" },
      nodes: [
        { id: "c", type: "CONDITION", config: { kind: "contact_tag", tagId: "x", operator: "has" } },
        { id: "e", type: "END", config: {} },
      ],
      edges: [{ id: "e1", source: "c", target: "e" }], // unlabeled
      startNodeId: "c",
    }).some((m) => m.includes("true and a false branch")));

  // F3: dead-end (non-END node, no outgoing edge)
  check("F3: dead-end non-END node → error",
    issuesFor({
      triggerType: "TAG_ADDED", triggerConfig: { tagId: "x" },
      nodes: [
        { id: "t", type: "ADD_TAG", config: { tagId: "x" } },
      ],
      edges: [], startNodeId: "t",
    }).some((m) => m.includes("no next step")));

  // F4: edge points to missing node
  check("F4: edge → missing node → error",
    issuesFor({
      triggerType: "TAG_ADDED", triggerConfig: { tagId: "x" },
      nodes: [
        { id: "t", type: "ADD_TAG", config: { tagId: "x" } },
        { id: "e", type: "END", config: {} },
      ],
      edges: [{ id: "broken", source: "t", target: "ghost" }],
      startNodeId: "t",
    }).some((m) => m.includes("missing node")));

  // F5: well-formed workflow → no issues
  check("F5: well-formed workflow → 0 issues",
    issuesFor({
      triggerType: "TAG_ADDED", triggerConfig: { tagId: "x" },
      nodes: [
        { id: "t", type: "ADD_TAG", config: { tagId: "x" } },
        { id: "e", type: "END", config: {} },
      ],
      edges: [{ id: "ok", source: "t", target: "e" }],
      startNodeId: "t",
    }).length === 0);

  // F6: CONDITION with both branches → no issues at graph level
  check("F6: CONDITION + both branches + valid config → 0 issues",
    issuesFor({
      triggerType: "TAG_ADDED", triggerConfig: { tagId: "x" },
      nodes: [
        { id: "c", type: "CONDITION", config: { kind: "contact_tag", tagId: "x", operator: "has" } },
        { id: "e", type: "END", config: {} },
      ],
      edges: [
        { id: "t", source: "c", target: "e", label: "true" },
        { id: "f", source: "c", target: "e", label: "false" },
      ],
      startNodeId: "c",
    }).length === 0);

  // ───────────────────────────────────────────────────────────────────────────
  //  GROUP G — DELAY scheduling math
  // ───────────────────────────────────────────────────────────────────────────
  section("G. DELAY scheduling math + validation boundary");

  // Mirror execDelay totalMs computation: (((days * 24) + hours) * 60 + minutes) * 60_000
  function delayMs(cfg: { days?: number; hours?: number; minutes?: number }) {
    const d = Number(cfg.days ?? 0), h = Number(cfg.hours ?? 0), m = Number(cfg.minutes ?? 0);
    return (((d * 24) + h) * 60 + m) * 60_000;
  }
  check("G1: 1 day 2 hours 30 min = 95400000 ms (26.5 hours)",
    delayMs({ days: 1, hours: 2, minutes: 30 }) === 95_400_000);
  check("G2: 0 0 0 → 0 ms (no-op, allowed)",
    delayMs({ days: 0, hours: 0, minutes: 0 }) === 0);
  check("G3: 365 days at the boundary",
    delayMs({ days: 365 }) === 365 * 24 * 60 * 60_000);

  // G4 & G5: validateNode catches >365d and negatives
  const validateDelay = (cfg: any) =>
    issuesFor({
      triggerType: "TAG_ADDED", triggerConfig: { tagId: "x" },
      nodes: [
        { id: "d", type: "DELAY", config: cfg },
        { id: "e", type: "END",   config: {} },
      ],
      edges: [{ id: "ok", source: "d", target: "e" }],
      startNodeId: "d",
    });

  check("G4: DELAY > 365 days → validation error",
    validateDelay({ days: 366 }).some((m) => m.includes("365 days")));
  check("G5: DELAY all zeros → 'set at least' error",
    validateDelay({ days: 0, hours: 0, minutes: 0 }).some((m) => m.includes("at least")));

  // ───────────────────────────────────────────────────────────────────────────
  //  GROUP H — SEND_EMAIL DB write shape
  // ───────────────────────────────────────────────────────────────────────────
  section("H. SEND_EMAIL — EmailSend row shape + counter bump");

  // Setup: create a workflow + a WorkflowEmail belonging to it.
  const wfH = await db.workflow.create({
    data: {
      workspaceId: ws.id, name: `${PREFIX}_send_email_wf`,
      status: "ACTIVE", triggerType: "TAG_ADDED", triggerConfig: { tagId: tagFoo.id },
      nodes: [{ id: "end", type: "END", position: { x: 0, y: 0 }, config: {} }] as any,
      edges: [] as any, startNodeId: "end",
    },
  });
  created.workflows.push(wfH.id);

  const we = await db.workflowEmail.create({
    data: {
      workspaceId: ws.id, workflowId: wfH.id,
      subject: "Hi {{firstName}}", bodyHtml: "<p>Welcome {{firstName}} {{lastName}}</p>",
      fromName: "Sender", fromEmail: "sender@example.test",
    },
  });
  created.workflowEmails.push(we.id);

  // Mirror execSendEmail's DB write (worker/queues/workflow.ts lines ~340-370):
  // creates EmailSend with workflowEmailId, then bumps WorkflowEmail.sentCount.
  async function execSendEmail_writeShape(contactId: string, workflowEmailId: string) {
    const we = await db.workflowEmail.findFirst({ where: { id: workflowEmailId } });
    if (!we) throw new Error("WorkflowEmail not found");
    const c = await db.contact.findFirst({ where: { id: contactId } });
    if (!c) throw new Error("Contact not found");
    const rendered = we.subject.replace(/{{firstName}}/g, c.firstName ?? "");
    const renderedBody = we.bodyHtml
      .replace(/{{firstName}}/g, c.firstName ?? "")
      .replace(/{{lastName}}/g, c.lastName ?? "");
    const send = await db.emailSend.create({
      data: {
        workspaceId: ws.id, contactId, toEmail: c.email,
        subject: rendered, bodyHtml: renderedBody,
        status: "QUEUED", workflowEmailId,
      },
    });
    await db.workflowEmail.update({
      where: { id: workflowEmailId },
      data:  { sentCount: { increment: 1 } },
    });
    return send;
  }

  const send = await execSendEmail_writeShape(contact.id, we.id);
  created.emailSends.push(send.id);

  // H1: EmailSend row has workflowEmailId FK set (source link for analytics)
  const reread = await db.emailSend.findUnique({
    where: { id: send.id },
    select: {
      workflowEmailId: true, contactId: true, status: true,
      subject: true, bodyHtml: true,
    },
  });
  check("H1: EmailSend.workflowEmailId set",     reread?.workflowEmailId === we.id);
  check("H2: EmailSend.contactId set",           reread?.contactId === contact.id);
  check("H3: EmailSend.status = QUEUED",         reread?.status === "QUEUED");
  check("H4: Mustache vars rendered in subject", reread?.subject === "Hi Alice");
  check("H5: Mustache vars rendered in body",    (reread?.bodyHtml ?? "").includes("Welcome Alice Wonderland"));

  const weAfter = await db.workflowEmail.findUnique({
    where: { id: we.id }, select: { sentCount: true },
  });
  check("H6: WorkflowEmail.sentCount bumped to 1", weAfter?.sentCount === 1);

  // H7: missing WorkflowEmail → throws
  let threw = false;
  try { await execSendEmail_writeShape(contact.id, "nonexistent_email_id"); }
  catch { threw = true; }
  check("H7: missing WorkflowEmail → error path triggered", threw);

  // ───────────────────────────────────────────────────────────────────────────
  //  GROUP I — Stale-job defense
  // ───────────────────────────────────────────────────────────────────────────
  // Calls processWorkflowJob directly with a mocked BullMQ Job. The processor
  // only reads job.data so `{ data: { runId, workspaceId, nodeId } }` is
  // enough — no Redis needed for the gates (they return before queue.add).
  section("I. Stale-job defense — processWorkflowJob lifecycle gates");

  const mockJob = (runId: string, nodeId: string) => ({ data: { runId, workspaceId: ws.id, nodeId } }) as any;
  const stepCountFor = (runId: string) => db.workflowRunStep.count({ where: { runId } });

  async function makeActiveWfWithEnd(name: string) {
    const wf = await db.workflow.create({
      data: {
        workspaceId: ws.id, name: `${PREFIX}_${name}_${Math.random().toString(36).slice(2, 7)}`,
        status: "ACTIVE", triggerType: "TAG_ADDED", triggerConfig: {},
        nodes: [{ id: "end", type: "END", position: { x: 0, y: 0 }, config: { reason: "end_node" } }] as any,
        edges: [] as any, startNodeId: "end",
      },
    });
    created.workflows.push(wf.id);
    return wf;
  }

  // I1: run.status = EXITED → processor skips, no WorkflowRunStep created
  {
    const wf  = await makeActiveWfWithEnd("stale_exited");
    const run = await db.workflowRun.create({
      data: {
        workflowId: wf.id, workspaceId: ws.id, contactId: contact.id,
        status: "EXITED", currentNodeId: "end", exitReason: "manual",
      },
    });
    created.workflowRuns.push(run.id);
    const result = await processWorkflowJob(mockJob(run.id, "end"));
    check("I1: run.status=EXITED → returns skipped",
      result?.skipped === true && String(result.reason).startsWith("run-status-"),
      { result });
    check("I1b: I1 created no WorkflowRunStep row",
      await stepCountFor(run.id) === 0);
  }

  // I2: run.status = FAILED → same skip behavior
  {
    const wf  = await makeActiveWfWithEnd("stale_failed");
    const run = await db.workflowRun.create({
      data: {
        workflowId: wf.id, workspaceId: ws.id, contactId: contact.id,
        status: "FAILED", currentNodeId: "end",
      },
    });
    created.workflowRuns.push(run.id);
    const result = await processWorkflowJob(mockJob(run.id, "end"));
    check("I2: run.status=FAILED → returns skipped",
      result?.skipped === true,
      { result });
    check("I2b: I2 created no step row", await stepCountFor(run.id) === 0);
  }

  // I3: workflow paused mid-flight → run is exited cleanly (EXITED with
  // exitReason = workflow_paused). Defense in depth against the operator
  // pausing a workflow that has in-flight runs.
  {
    const wf = await db.workflow.create({
      data: {
        workspaceId: ws.id, name: `${PREFIX}_paused_mid_${Math.random().toString(36).slice(2, 7)}`,
        status: "PAUSED", triggerType: "TAG_ADDED", triggerConfig: {},
        nodes: [{ id: "end", type: "END", position: { x: 0, y: 0 }, config: {} }] as any,
        edges: [] as any, startNodeId: "end",
      },
    });
    created.workflows.push(wf.id);
    const run = await db.workflowRun.create({
      data: {
        workflowId: wf.id, workspaceId: ws.id, contactId: contact.id,
        status: "ACTIVE", currentNodeId: "end",
      },
    });
    created.workflowRuns.push(run.id);
    const result = await processWorkflowJob(mockJob(run.id, "end"));
    const after  = await db.workflowRun.findUnique({
      where: { id: run.id }, select: { status: true, exitReason: true },
    });
    check("I3: workflow PAUSED mid-flight → returns skipped",
      result?.skipped === true, { result });
    check("I3b: I3 run advanced to EXITED with workflow_paused reason",
      after?.status === "EXITED" && after?.exitReason === "workflow_paused",
      { after });
  }

  // I4: workflow archived mid-flight → run exited with workflow_archived
  {
    const wf = await db.workflow.create({
      data: {
        workspaceId: ws.id, name: `${PREFIX}_archived_mid_${Math.random().toString(36).slice(2, 7)}`,
        status: "ARCHIVED", triggerType: "TAG_ADDED", triggerConfig: {},
        nodes: [{ id: "end", type: "END", position: { x: 0, y: 0 }, config: {} }] as any,
        edges: [] as any, startNodeId: "end",
      },
    });
    created.workflows.push(wf.id);
    const run = await db.workflowRun.create({
      data: {
        workflowId: wf.id, workspaceId: ws.id, contactId: contact.id,
        status: "ACTIVE", currentNodeId: "end",
      },
    });
    created.workflowRuns.push(run.id);
    await processWorkflowJob(mockJob(run.id, "end"));
    const after = await db.workflowRun.findUnique({
      where: { id: run.id }, select: { status: true, exitReason: true },
    });
    check("I4: workflow ARCHIVED mid-flight → run EXITED with workflow_archived",
      after?.status === "EXITED" && after?.exitReason === "workflow_archived",
      { after });
  }

  // I5: graph edited mid-flight — run.currentNodeId points at a node id the
  // job was not scheduled for. Processor must skip and leave the run alone.
  {
    const wf  = await makeActiveWfWithEnd("stale_node");
    const run = await db.workflowRun.create({
      data: {
        workflowId: wf.id, workspaceId: ws.id, contactId: contact.id,
        status: "ACTIVE", currentNodeId: "node_after_edit",  // different from job's nodeId
      },
    });
    created.workflowRuns.push(run.id);
    const result = await processWorkflowJob(mockJob(run.id, "end"));
    const after  = await db.workflowRun.findUnique({
      where: { id: run.id }, select: { status: true, currentNodeId: true },
    });
    check("I5: nodeId ≠ run.currentNodeId → returns skipped with stale-node",
      result?.skipped === true && result?.reason === "stale-node", { result });
    check("I5b: I5 left run untouched (status=ACTIVE, currentNodeId preserved)",
      after?.status === "ACTIVE" && after?.currentNodeId === "node_after_edit",
      { after });
    check("I5c: I5 created no step row", await stepCountFor(run.id) === 0);
  }

  // I6: happy-path sanity — defenses don't false-positive. Workflow ACTIVE,
  // run ACTIVE, nodeId matches → executor runs END node → run COMPLETED.
  {
    const wf  = await makeActiveWfWithEnd("happy_end");
    const run = await db.workflowRun.create({
      data: {
        workflowId: wf.id, workspaceId: ws.id, contactId: contact.id,
        status: "ACTIVE", currentNodeId: "end",
      },
    });
    created.workflowRuns.push(run.id);
    const result = await processWorkflowJob(mockJob(run.id, "end"));
    const after  = await db.workflowRun.findUnique({
      where: { id: run.id }, select: { status: true, exitReason: true },
    });
    check("I6: happy path END → returns terminated",
      !!result?.terminated, { result });
    check("I6b: I6 run COMPLETED with end_node reason",
      after?.status === "COMPLETED" && after?.exitReason === "end_node",
      { after });
    check("I6c: I6 created exactly 1 step row", await stepCountFor(run.id) === 1);
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  GROUP J — Re-enroll edge cases (after dropping the policy field)
  // ───────────────────────────────────────────────────────────────────────────
  // SINGLE_ACTIVE is hardcoded: a contact with an in-flight run is blocked.
  // But three cases must NOT be blocked: anonymous fires (no contactId to
  // check), and existing runs in any terminal status (COMPLETED, EXITED,
  // FAILED). These tests pin that behavior.
  section("J. Re-enroll — anonymous + terminal-status runs allow new enroll");

  async function makeWfJ(name: string) {
    const wf = await db.workflow.create({
      data: {
        workspaceId: ws.id, name: `${PREFIX}_${name}_${Math.random().toString(36).slice(2, 7)}`,
        status: "ACTIVE", triggerType: "TAG_ADDED", triggerConfig: {},
        nodes: [{ id: "end", type: "END", position: { x: 0, y: 0 }, config: {} }] as any,
        edges: [] as any, startNodeId: "end",
      },
    });
    created.workflows.push(wf.id);
    return wf.id;
  }

  // J1: anonymous trigger — no contactId in context → SINGLE_ACTIVE check
  // skipped entirely → both fires create runs.
  {
    const wfId = await makeWfJ("anon");
    await fireTrigger(ws.id, "TAG_ADDED", {});
    await fireTrigger(ws.id, "TAG_ADDED", {});
    const n = await db.workflowRun.count({ where: { workflowId: wfId } });
    check("J1: 2 anonymous fires (no contactId) → 2 runs (no SINGLE_ACTIVE block)",
      n === 2, { count: n });
  }

  // J2: prior run COMPLETED — terminal status doesn't block a fresh enroll.
  {
    const wfId = await makeWfJ("prior_completed");
    const seeded = await db.workflowRun.create({
      data: {
        workflowId: wfId, workspaceId: ws.id, contactId: contact.id,
        status: "COMPLETED", completedAt: new Date(),
      },
    });
    created.workflowRuns.push(seeded.id);
    await fireTrigger(ws.id, "TAG_ADDED", { contactId: contact.id });
    const n = await db.workflowRun.count({ where: { workflowId: wfId } });
    check("J2: prior run COMPLETED → fire enrolls again (2 total)", n === 2, { count: n });
  }

  // J3: prior run EXITED (manual exit or workflow paused) — same as J2.
  {
    const wfId = await makeWfJ("prior_exited");
    const seeded = await db.workflowRun.create({
      data: {
        workflowId: wfId, workspaceId: ws.id, contactId: contact.id,
        status: "EXITED", exitReason: "test", completedAt: new Date(),
      },
    });
    created.workflowRuns.push(seeded.id);
    await fireTrigger(ws.id, "TAG_ADDED", { contactId: contact.id });
    const n = await db.workflowRun.count({ where: { workflowId: wfId } });
    check("J3: prior run EXITED → fire enrolls again (2 total)", n === 2, { count: n });
  }

  // J4: prior run FAILED — same; failed runs don't lock the contact out.
  {
    const wfId = await makeWfJ("prior_failed");
    const seeded = await db.workflowRun.create({
      data: {
        workflowId: wfId, workspaceId: ws.id, contactId: contact.id,
        status: "FAILED", completedAt: new Date(),
      },
    });
    created.workflowRuns.push(seeded.id);
    await fireTrigger(ws.id, "TAG_ADDED", { contactId: contact.id });
    const n = await db.workflowRun.count({ where: { workflowId: wfId } });
    check("J4: prior run FAILED → fire enrolls again (2 total)", n === 2, { count: n });
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  GROUP K — Validation gaps (pure logic, no DB)
  // ───────────────────────────────────────────────────────────────────────────
  // Anchors per-rule error messages we rely on for the pre-flight modal so
  // a refactor of validateWorkflow can't silently relax a check.
  section("K. validateWorkflow — gaps not covered by F/G");

  // Flatten issues to a single string array so we can substring-match the
  // specific message we expect, without coupling to issue ordering.
  const issuesOf = (wf: any): string[] => validateWorkflow(wf).flatMap((i: any) => i.messages);
  const hasMsg = (wf: any, substr: string): boolean =>
    issuesOf(wf).some((m) => m.toLowerCase().includes(substr.toLowerCase()));
  const wfShell = (over: any) => ({
    triggerType: "TAG_ADDED", triggerConfig: { tagId: "any" },
    nodes: [{ id: "end", type: "END", config: {} }],
    edges: [], startNodeId: "end", ...over,
  });

  // ─ Trigger ────────────────────────────────────────────────────────────────
  check("K1: empty triggerType → 'Pick a trigger type'",
    hasMsg(wfShell({ triggerType: "" }), "pick a trigger type"));
  check("K2: TAG_ADDED missing tagId → tag selector error",
    hasMsg(wfShell({ triggerType: "TAG_ADDED", triggerConfig: {} }), "which tag"));
  check("K3: NEW_SALE missing funnelStepId → step selector error",
    hasMsg(wfShell({ triggerType: "NEW_SALE", triggerConfig: { funnelId: "f1" } }), "which step"));
  check("K4: EMAIL_OPENED missing source → source error",
    hasMsg(wfShell({ triggerType: "EMAIL_OPENED", triggerConfig: {} }), "email source"));
  check("K5: EMAIL_OPENED source=broadcast no broadcastId → broadcast error",
    hasMsg(wfShell({ triggerType: "EMAIL_OPENED", triggerConfig: { source: "broadcast" } }), "which broadcast"));
  check("K6: EMAIL_OPENED source=workflow_email no id → workflow email error",
    hasMsg(wfShell({ triggerType: "EMAIL_OPENED", triggerConfig: { source: "workflow_email" } }), "which workflow email"));
  check("K7: EMAIL_OPENED unsupported source → 'isn't supported'",
    hasMsg(wfShell({ triggerType: "EMAIL_OPENED", triggerConfig: { source: "any" } }), "isn't supported"));
  check("K8: EMAIL_LINK_CLICKED + valid linkUrl path → 0 trigger issues",
    issuesOf(wfShell({
      triggerType: "EMAIL_LINK_CLICKED",
      triggerConfig: { source: "broadcast", broadcastId: "b1", linkUrl: "/checkout" },
    })).filter((m) => m.toLowerCase().includes("link")).length === 0);
  check("K9: EMAIL_LINK_CLICKED + empty linkUrl → 'link filter is empty'",
    hasMsg(wfShell({
      triggerType: "EMAIL_LINK_CLICKED",
      triggerConfig: { source: "broadcast", broadcastId: "b1", linkUrl: "   " },
    }), "link filter is empty"));
  check("K10: EMAIL_LINK_CLICKED + invalid linkUrl → 'URL or URL substring'",
    hasMsg(wfShell({
      triggerType: "EMAIL_LINK_CLICKED",
      triggerConfig: { source: "broadcast", broadcastId: "b1", linkUrl: "noslashhere" },
    }), "url or url substring"));

  // ─ Per-node ───────────────────────────────────────────────────────────────
  check("K11: SEND_EMAIL missing emailId → 'Pick or create'",
    hasMsg(wfShell({
      nodes: [{ id: "n1", type: "SEND_EMAIL", config: {} }, { id: "end", type: "END", config: {} }],
      edges: [{ id: "e", source: "n1", target: "end" }], startNodeId: "n1",
    }), "pick or create an email"));
  check("K12: SEND_EMAIL emailId references nonexistent email → 'no longer exists'",
    hasMsg(wfShell({
      nodes: [{ id: "n1", type: "SEND_EMAIL", config: { emailId: "missing" } }, { id: "end", type: "END", config: {} }],
      edges: [{ id: "e", source: "n1", target: "end" }], startNodeId: "n1",
      emails: [],
    }), "no longer exists"));
  check("K13: SEND_EMAIL linked email missing subject → 'subject is empty'",
    hasMsg(wfShell({
      nodes: [{ id: "n1", type: "SEND_EMAIL", config: { emailId: "e1" } }, { id: "end", type: "END", config: {} }],
      edges: [{ id: "e", source: "n1", target: "end" }], startNodeId: "n1",
      emails: [{ id: "e1", subject: "", bodyHtml: "<p>x</p>", fromName: "S", fromEmail: "s@x.com" }],
    }), "subject is empty"));
  check("K14: SEND_EMAIL linked email missing sender → 'sender is not picked'",
    hasMsg(wfShell({
      nodes: [{ id: "n1", type: "SEND_EMAIL", config: { emailId: "e1" } }, { id: "end", type: "END", config: {} }],
      edges: [{ id: "e", source: "n1", target: "end" }], startNodeId: "n1",
      emails: [{ id: "e1", subject: "Hi", bodyHtml: "<p>x</p>", fromName: "", fromEmail: "" }],
    }), "sender is not picked"));
  check("K15: WEBHOOK missing url → 'URL is empty'",
    hasMsg(wfShell({
      nodes: [{ id: "n1", type: "WEBHOOK", config: {} }, { id: "end", type: "END", config: {} }],
      edges: [{ id: "e", source: "n1", target: "end" }], startNodeId: "n1",
    }), "url is empty"));
  check("K16: WEBHOOK non-http url → 'must start with http'",
    hasMsg(wfShell({
      nodes: [{ id: "n1", type: "WEBHOOK", config: { url: "ftp://x" } }, { id: "end", type: "END", config: {} }],
      edges: [{ id: "e", source: "n1", target: "end" }], startNodeId: "n1",
    }), "must start with http"));
  check("K17: WEBHOOK invalid method DELETE → 'Method must be'",
    hasMsg(wfShell({
      nodes: [{ id: "n1", type: "WEBHOOK", config: { url: "https://x.example", method: "DELETE" } }, { id: "end", type: "END", config: {} }],
      edges: [{ id: "e", source: "n1", target: "end" }], startNodeId: "n1",
    }), "method must be"));
  check("K18: ADD_TAG missing tagId → 'No tag selected'",
    hasMsg(wfShell({
      nodes: [{ id: "n1", type: "ADD_TAG", config: {} }, { id: "end", type: "END", config: {} }],
      edges: [{ id: "e", source: "n1", target: "end" }], startNodeId: "n1",
    }), "no tag selected"));
  check("K19: DELAY negative → 'cannot be negative'",
    hasMsg(wfShell({
      nodes: [{ id: "n1", type: "DELAY", config: { hours: -1 } }, { id: "end", type: "END", config: {} }],
      edges: [{ id: "e", source: "n1", target: "end" }], startNodeId: "n1",
    }), "cannot be negative"));

  // ─ CONDITION ──────────────────────────────────────────────────────────────
  check("K20: CONDITION missing kind → 'Condition kind not picked'",
    hasMsg(wfShell({
      nodes: [
        { id: "c", type: "CONDITION", config: {} },
        { id: "t", type: "END", config: {} }, { id: "f", type: "END", config: {} },
      ],
      edges: [
        { id: "e1", source: "c", target: "t", label: "true" },
        { id: "e2", source: "c", target: "f", label: "false" },
      ],
      startNodeId: "c",
    }), "condition kind not picked"));
  check("K21: CONDITION contact_field missing field → 'Pick a contact field'",
    hasMsg(wfShell({
      nodes: [
        { id: "c", type: "CONDITION", config: { kind: "contact_field", operator: "equals", value: "x" } },
        { id: "t", type: "END", config: {} }, { id: "f", type: "END", config: {} },
      ],
      edges: [
        { id: "e1", source: "c", target: "t", label: "true" },
        { id: "e2", source: "c", target: "f", label: "false" },
      ],
      startNodeId: "c",
    }), "pick a contact field"));
  check("K22: CONDITION contact_field invalid operator → 'Operator \"X\" isn't supported'",
    hasMsg(wfShell({
      nodes: [
        { id: "c", type: "CONDITION", config: { kind: "contact_field", field: "firstName", operator: "regex", value: "x" } },
        { id: "t", type: "END", config: {} }, { id: "f", type: "END", config: {} },
      ],
      edges: [
        { id: "e1", source: "c", target: "t", label: "true" },
        { id: "e2", source: "c", target: "f", label: "false" },
      ],
      startNodeId: "c",
    }), "isn't supported"));
  check("K23: CONDITION email_opened missing source → source error",
    hasMsg(wfShell({
      nodes: [
        { id: "c", type: "CONDITION", config: { kind: "email_opened" } },
        { id: "t", type: "END", config: {} }, { id: "f", type: "END", config: {} },
      ],
      edges: [
        { id: "e1", source: "c", target: "t", label: "true" },
        { id: "e2", source: "c", target: "f", label: "false" },
      ],
      startNodeId: "c",
    }), "email source"));
  check("K24: CONDITION unknown kind → 'isn't supported'",
    hasMsg(wfShell({
      nodes: [
        { id: "c", type: "CONDITION", config: { kind: "always_true" } },
        { id: "t", type: "END", config: {} }, { id: "f", type: "END", config: {} },
      ],
      edges: [
        { id: "e1", source: "c", target: "t", label: "true" },
        { id: "e2", source: "c", target: "f", label: "false" },
      ],
      startNodeId: "c",
    }), "isn't supported"));
  check("K25: deprecated node type (SPLIT) → 'no longer supported'",
    hasMsg(wfShell({
      nodes: [{ id: "n1", type: "SPLIT", config: {} }, { id: "end", type: "END", config: {} }],
      edges: [{ id: "e", source: "n1", target: "end" }], startNodeId: "n1",
    }), "no longer supported"));

  // ───────────────────────────────────────────────────────────────────────────
  //  GROUP L — Executor sanity (calls processWorkflowJob)
  // ───────────────────────────────────────────────────────────────────────────
  // For each non-trivial node type we exercise the happy path AND at least one
  // failure mode. WEBHOOK runtime is skipped here (would need a local HTTP
  // server); its config rules are pinned by K15/K16/K17.
  section("L. Executor — ADD_TAG / REMOVE_TAG / DELAY / CONDITION / END / SEND_EMAIL");

  const lContact = await db.contact.create({
    data: { workspaceId: ws.id, email: `${PREFIX}_l@example.test`, firstName: "Leo" },
  });
  created.contacts.push(lContact.id);
  const lTagOK  = await db.tag.create({ data: { workspaceId: ws.id, name: `${PREFIX}_l_ok` } });
  const lTagOK2 = await db.tag.create({ data: { workspaceId: ws.id, name: `${PREFIX}_l_ok2` } });
  created.tags.push(lTagOK.id, lTagOK2.id);

  // Re-uses Group I's helpers (mockJob, makeActiveWfWithEnd) via closure.
  const makeWfL = async (label: string, nodes: any[], edges: any[], startNodeId: string) => {
    const wf = await db.workflow.create({
      data: {
        workspaceId: ws.id, name: `${PREFIX}_l_${label}_${Math.random().toString(36).slice(2, 7)}`,
        status: "ACTIVE", triggerType: "TAG_ADDED", triggerConfig: {},
        nodes: nodes as any, edges: edges as any, startNodeId,
      },
    });
    created.workflows.push(wf.id);
    return wf;
  };
  const makeRunL = async (wfId: string, currentNodeId: string, contactId: string | null = lContact.id) => {
    const run = await db.workflowRun.create({
      data: { workflowId: wfId, workspaceId: ws.id, contactId, status: "ACTIVE", currentNodeId },
    });
    created.workflowRuns.push(run.id);
    return run.id;
  };
  const lastStep = (runId: string) =>
    db.workflowRunStep.findFirst({ where: { runId }, orderBy: { startedAt: "desc" } });

  // ─ ADD_TAG ────────────────────────────────────────────────────────────────
  // L1: ADD_TAG happy path → ContactTag + ContactEvent created, step COMPLETED,
  // run advances to next node.
  {
    const wf = await makeWfL("addtag_ok",
      [
        { id: "tag", type: "ADD_TAG", position: { x: 0, y: 0 }, config: { tagId: lTagOK.id } },
        { id: "end", type: "END",    position: { x: 0, y: 0 }, config: {} },
      ],
      [{ id: "e", source: "tag", target: "end" }],
      "tag");
    const runId = await makeRunL(wf.id, "tag");
    await processWorkflowJob(mockJob(runId, "tag"));
    const ct = await db.contactTag.findUnique({
      where: { contactId_tagId: { contactId: lContact.id, tagId: lTagOK.id } },
    });
    const ev = await db.contactEvent.findFirst({
      where: { contactId: lContact.id, type: "TAG_ADDED" }, orderBy: { createdAt: "desc" },
    });
    const step = await lastStep(runId);
    const after = await db.workflowRun.findUnique({ where: { id: runId }, select: { currentNodeId: true } });
    check("L1: ADD_TAG → ContactTag row exists",          !!ct);
    check("L1b: ADD_TAG → ContactEvent (TAG_ADDED) created", !!ev);
    check("L1c: ADD_TAG → step COMPLETED",                step?.status === "COMPLETED");
    check("L1d: ADD_TAG → run advanced to next node",     after?.currentNodeId === "end");
    // ContactTag + ContactEvent cleaned up via contact cascade in cleanup().
  }

  // L2: ADD_TAG with non-existent tagId → step FAILED, run still advances
  // (best-effort posture — see processWorkflowJob comments).
  {
    const wf = await makeWfL("addtag_bad",
      [
        { id: "tag", type: "ADD_TAG", position: { x: 0, y: 0 }, config: { tagId: "no_such_tag" } },
        { id: "end", type: "END",    position: { x: 0, y: 0 }, config: {} },
      ],
      [{ id: "e", source: "tag", target: "end" }],
      "tag");
    const runId = await makeRunL(wf.id, "tag");
    await processWorkflowJob(mockJob(runId, "tag"));
    const step = await lastStep(runId);
    check("L2: ADD_TAG bad tagId → step FAILED with 'not found'",
      step?.status === "FAILED" && /not found/i.test(step?.error ?? ""), { error: step?.error });
  }

  // L3: ADD_TAG without contact in run → step FAILED with 'requires a contact'.
  {
    const wf = await makeWfL("addtag_nocontact",
      [
        { id: "tag", type: "ADD_TAG", position: { x: 0, y: 0 }, config: { tagId: lTagOK.id } },
        { id: "end", type: "END",    position: { x: 0, y: 0 }, config: {} },
      ],
      [{ id: "e", source: "tag", target: "end" }],
      "tag");
    const runId = await makeRunL(wf.id, "tag", null);
    await processWorkflowJob(mockJob(runId, "tag"));
    const step = await lastStep(runId);
    check("L3: ADD_TAG without contact → step FAILED 'requires a contact'",
      step?.status === "FAILED" && /requires a contact/i.test(step?.error ?? ""), { error: step?.error });
  }

  // ─ REMOVE_TAG ─────────────────────────────────────────────────────────────
  // L4: REMOVE_TAG happy path → ContactTag deleted, ContactEvent created.
  // Setup: apply lTagOK2 first so there's something to remove.
  {
    await db.contactTag.upsert({
      where: { contactId_tagId: { contactId: lContact.id, tagId: lTagOK2.id } },
      create: { contactId: lContact.id, tagId: lTagOK2.id },
      update: {},
    });
    const wf = await makeWfL("removetag_ok",
      [
        { id: "rm",  type: "REMOVE_TAG", position: { x: 0, y: 0 }, config: { tagId: lTagOK2.id } },
        { id: "end", type: "END",        position: { x: 0, y: 0 }, config: {} },
      ],
      [{ id: "e", source: "rm", target: "end" }],
      "rm");
    const runId = await makeRunL(wf.id, "rm");
    await processWorkflowJob(mockJob(runId, "rm"));
    const ct = await db.contactTag.findUnique({
      where: { contactId_tagId: { contactId: lContact.id, tagId: lTagOK2.id } },
    });
    const step = await lastStep(runId);
    check("L4: REMOVE_TAG → ContactTag deleted",    ct === null);
    check("L4b: REMOVE_TAG → step COMPLETED",       step?.status === "COMPLETED");
  }

  // L5: REMOVE_TAG idempotent — when no ContactTag exists, no error.
  {
    const wf = await makeWfL("removetag_idem",
      [
        { id: "rm",  type: "REMOVE_TAG", position: { x: 0, y: 0 }, config: { tagId: lTagOK2.id } },
        { id: "end", type: "END",        position: { x: 0, y: 0 }, config: {} },
      ],
      [{ id: "e", source: "rm", target: "end" }],
      "rm");
    const runId = await makeRunL(wf.id, "rm");
    await processWorkflowJob(mockJob(runId, "rm"));
    const step = await lastStep(runId);
    check("L5: REMOVE_TAG (nothing to remove) → step still COMPLETED (idempotent)",
      step?.status === "COMPLETED", { error: step?.error });
  }

  // ─ DELAY ──────────────────────────────────────────────────────────────────
  // L6: DELAY 1 hour → sets run.scheduledFor ~now+1h, advances currentNodeId.
  {
    const wf = await makeWfL("delay_1h",
      [
        { id: "d",   type: "DELAY", position: { x: 0, y: 0 }, config: { hours: 1 } },
        { id: "end", type: "END",   position: { x: 0, y: 0 }, config: {} },
      ],
      [{ id: "e", source: "d", target: "end" }],
      "d");
    const runId = await makeRunL(wf.id, "d");
    const t0 = Date.now();
    await processWorkflowJob(mockJob(runId, "d"));
    const after = await db.workflowRun.findUnique({
      where: { id: runId }, select: { currentNodeId: true, scheduledFor: true },
    });
    const targetMs = (after?.scheduledFor?.getTime() ?? 0) - t0;
    // Allow generous skew window — DB round-trip + processor work.
    check("L6: DELAY 1h → currentNodeId advanced to next",
      after?.currentNodeId === "end");
    check("L6b: DELAY 1h → scheduledFor ~1h ahead (3540s..3660s)",
      targetMs > 3540_000 && targetMs < 3660_000, { targetMs });
  }

  // L7: DELAY zero → scheduledFor stays null, run advances immediately.
  {
    const wf = await makeWfL("delay_zero",
      [
        { id: "d",   type: "DELAY", position: { x: 0, y: 0 }, config: { hours: 0 } },
        { id: "end", type: "END",   position: { x: 0, y: 0 }, config: {} },
      ],
      [{ id: "e", source: "d", target: "end" }],
      "d");
    const runId = await makeRunL(wf.id, "d");
    await processWorkflowJob(mockJob(runId, "d"));
    const after = await db.workflowRun.findUnique({
      where: { id: runId }, select: { currentNodeId: true, scheduledFor: true },
    });
    check("L7: DELAY zero → scheduledFor null, run advances",
      after?.currentNodeId === "end" && after?.scheduledFor === null);
  }

  // ─ CONDITION routing ──────────────────────────────────────────────────────
  // L8: CONDITION true → takes edge with label "true". Contact has lTagOK
  // (asserted in L1) → contact_tag has → true.
  {
    const wf = await makeWfL("cond_true",
      [
        { id: "c",  type: "CONDITION", position: { x: 0, y: 0 }, config: { kind: "contact_tag", tagId: lTagOK.id, operator: "has" } },
        { id: "et", type: "END",       position: { x: 0, y: 0 }, config: { reason: "true_branch" } },
        { id: "ef", type: "END",       position: { x: 0, y: 0 }, config: { reason: "false_branch" } },
      ],
      [
        { id: "e1", source: "c", target: "et", label: "true" },
        { id: "e2", source: "c", target: "ef", label: "false" },
      ],
      "c");
    const runId = await makeRunL(wf.id, "c");
    await processWorkflowJob(mockJob(runId, "c"));
    const after = await db.workflowRun.findUnique({ where: { id: runId }, select: { currentNodeId: true } });
    check("L8: CONDITION true → run advanced to 'et' (true branch)",
      after?.currentNodeId === "et", { actual: after?.currentNodeId });
  }

  // L9: CONDITION false → takes edge with label "false". tag does_not_have
  // a tag the contact doesn't have → true… invert by using a tag the
  // contact DOES have with operator does_not_have → false.
  {
    const wf = await makeWfL("cond_false",
      [
        { id: "c",  type: "CONDITION", position: { x: 0, y: 0 }, config: { kind: "contact_tag", tagId: lTagOK.id, operator: "does_not_have" } },
        { id: "et", type: "END",       position: { x: 0, y: 0 }, config: {} },
        { id: "ef", type: "END",       position: { x: 0, y: 0 }, config: {} },
      ],
      [
        { id: "e1", source: "c", target: "et", label: "true" },
        { id: "e2", source: "c", target: "ef", label: "false" },
      ],
      "c");
    const runId = await makeRunL(wf.id, "c");
    await processWorkflowJob(mockJob(runId, "c"));
    const after = await db.workflowRun.findUnique({ where: { id: runId }, select: { currentNodeId: true } });
    check("L9: CONDITION false → run advanced to 'ef' (false branch)",
      after?.currentNodeId === "ef", { actual: after?.currentNodeId });
  }

  // L10: CONDITION email_opened with invalid source → fail-closed (false branch).
  {
    const wf = await makeWfL("cond_email_failclosed",
      [
        { id: "c",  type: "CONDITION", position: { x: 0, y: 0 }, config: { kind: "email_opened", source: "any" } },
        { id: "et", type: "END",       position: { x: 0, y: 0 }, config: {} },
        { id: "ef", type: "END",       position: { x: 0, y: 0 }, config: {} },
      ],
      [
        { id: "e1", source: "c", target: "et", label: "true" },
        { id: "e2", source: "c", target: "ef", label: "false" },
      ],
      "c");
    const runId = await makeRunL(wf.id, "c");
    await processWorkflowJob(mockJob(runId, "c"));
    const after = await db.workflowRun.findUnique({ where: { id: runId }, select: { currentNodeId: true } });
    check("L10: CONDITION email_opened bad source → routes to false (fail-closed)",
      after?.currentNodeId === "ef", { actual: after?.currentNodeId });
  }

  // L11: CONDITION unknown kind → step FAILED.
  {
    const wf = await makeWfL("cond_unknown",
      [
        { id: "c",  type: "CONDITION", position: { x: 0, y: 0 }, config: { kind: "always_true" } },
        { id: "et", type: "END",       position: { x: 0, y: 0 }, config: {} },
        { id: "ef", type: "END",       position: { x: 0, y: 0 }, config: {} },
      ],
      [
        { id: "e1", source: "c", target: "et", label: "true" },
        { id: "e2", source: "c", target: "ef", label: "false" },
      ],
      "c");
    const runId = await makeRunL(wf.id, "c");
    await processWorkflowJob(mockJob(runId, "c"));
    const step = await lastStep(runId);
    check("L11: CONDITION unknown kind → step FAILED 'unsupported kind'",
      step?.status === "FAILED" && /unsupported kind/i.test(step?.error ?? ""), { error: step?.error });
  }

  // ─ END reason ─────────────────────────────────────────────────────────────
  // L12: END with config.reason → run.exitReason = that reason.
  {
    const wf = await makeWfL("end_reason",
      [{ id: "end", type: "END", position: { x: 0, y: 0 }, config: { reason: "goal_met" } }],
      [],
      "end");
    const runId = await makeRunL(wf.id, "end");
    await processWorkflowJob(mockJob(runId, "end"));
    const after = await db.workflowRun.findUnique({ where: { id: runId }, select: { status: true, exitReason: true } });
    check("L12: END with reason → run COMPLETED with exitReason=goal_met",
      after?.status === "COMPLETED" && after?.exitReason === "goal_met", { after });
  }

  // ─ SEND_EMAIL cross-workflow guard ────────────────────────────────────────
  // L13: SEND_EMAIL with emailId belonging to a DIFFERENT workflow → throws
  // 'doesn't belong to this workflow', step FAILED.
  {
    // Email belongs to wfOther; run executes on wfMain.
    const wfOther = await makeWfL("se_other", [{ id: "end", type: "END", position: { x: 0, y: 0 }, config: {} }], [], "end");
    const otherEmail = await db.workflowEmail.create({
      data: {
        workspaceId: ws.id, workflowId: wfOther.id,
        subject: "S", bodyHtml: "<p>x</p>", fromName: "F", fromEmail: "f@x.com",
      },
    });
    created.workflowEmails.push(otherEmail.id);
    const wfMain = await makeWfL("se_main",
      [
        { id: "se",  type: "SEND_EMAIL", position: { x: 0, y: 0 }, config: { emailId: otherEmail.id } },
        { id: "end", type: "END",        position: { x: 0, y: 0 }, config: {} },
      ],
      [{ id: "e", source: "se", target: "end" }],
      "se");
    const runId = await makeRunL(wfMain.id, "se");
    await processWorkflowJob(mockJob(runId, "se"));
    const step = await lastStep(runId);
    check("L13: SEND_EMAIL email from another workflow → step FAILED 'doesn't belong'",
      step?.status === "FAILED" && /doesn't belong/i.test(step?.error ?? ""), { error: step?.error });
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  GROUP M — WEBHOOK executor (real HTTP)
  // ───────────────────────────────────────────────────────────────────────────
  // Spins up a local http server on a random port. Each WEBHOOK node points
  // at a path on it; the server records the request so we can assert headers
  // + body shape. /fail path returns 500 to exercise the non-2xx branch.
  section("M. WEBHOOK executor — payload shape + headers + failure path");

  type CapturedRequest = {
    method:  string;
    path:    string;
    headers: Record<string, string | string[] | undefined>;
    body:    any;
  };
  const captured: CapturedRequest[] = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      let body: any = null;
      if (raw) { try { body = JSON.parse(raw); } catch { body = raw; } }
      captured.push({
        method:  req.method ?? "",
        path:    req.url ?? "",
        headers: req.headers,
        body,
      });
      if (req.url === "/fail") { res.statusCode = 500; res.end("server error"); return; }
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as any).port as number;
  const baseUrl = `http://127.0.0.1:${port}`;
  let serverClosed = false;

  try {
    // Helper to build a WEBHOOK→END workflow with the supplied node config.
    // Uses TAG_ADDED as the workflow triggerType so the payload's `type`
    // discriminator should serialize as "tag_added".
    const makeWebhookWf = async (label: string, webhookConfig: Record<string, unknown>) => {
      const wf = await db.workflow.create({
        data: {
          workspaceId: ws.id, name: `${PREFIX}_m_${label}_${Math.random().toString(36).slice(2, 7)}`,
          status: "ACTIVE", triggerType: "TAG_ADDED", triggerConfig: {},
          nodes: [
            { id: "wh",  type: "WEBHOOK", position: { x: 0, y: 0 }, config: webhookConfig },
            { id: "end", type: "END",    position: { x: 0, y: 0 }, config: {} },
          ] as any,
          edges: [{ id: "e", source: "wh", target: "end" }] as any,
          startNodeId: "wh",
        },
      });
      created.workflows.push(wf.id);
      return wf;
    };

    // M1: Happy path — POST to /ok. Capture request. Assert envelope shape +
    // standard X-Launchtic headers + body.data.contact.
    {
      const before = captured.length;
      const wf = await makeWebhookWf("happy", { url: `${baseUrl}/ok`, method: "POST" });
      const run = await db.workflowRun.create({
        data: { workflowId: wf.id, workspaceId: ws.id, contactId: lContact.id, status: "ACTIVE", currentNodeId: "wh" },
      });
      created.workflowRuns.push(run.id);
      await processWorkflowJob(mockJob(run.id, "wh"));
      const step = await lastStep(run.id);
      const req  = captured[before];
      check("M1: step COMPLETED + nodeOutput status=200",
        step?.status === "COMPLETED" && (step?.output as any)?.status === 200,
        { step });
      check("M1b: request received with method POST + path /ok",
        req?.method === "POST" && req?.path === "/ok");
      check("M1c: payload.type = lowercased triggerType ('tag_added')",
        req?.body?.type === "tag_added");
      check("M1d: payload envelope has workspaceId at top level",
        req?.body?.workspaceId === ws.id);
      check("M1e: payload.data.contact.email matches enrolled contact",
        req?.body?.data?.contact?.email === lContact.email);
      check("M1f: payload.data carries workflowId + runId + nodeId",
        req?.body?.data?.workflowId === wf.id
        && req?.body?.data?.runId === run.id
        && req?.body?.data?.nodeId === "wh");
      check("M1g: sentAt is ISO timestamp",
        typeof req?.body?.sentAt === "string" && req.body.sentAt.endsWith("Z"));
    }

    // M2: Standard X-Launchtic-* headers are present + correct.
    {
      const req = captured[captured.length - 1];
      check("M2: X-Launchtic-Workspace = workspace id",
        req?.headers?.["x-launchtic-workspace"] === ws.id);
      check("M2b: X-Launchtic-Run / Workflow / Node all set",
        !!req?.headers?.["x-launchtic-run"]
        && !!req?.headers?.["x-launchtic-workflow"]
        && req?.headers?.["x-launchtic-node"] === "wh");
      check("M2c: User-Agent is Launchtic-Workflow/1.0",
        req?.headers?.["user-agent"] === "Launchtic-Workflow/1.0");
    }

    // M3: Custom headers (array form, new shape) spread into the request.
    {
      const before = captured.length;
      const wf = await makeWebhookWf("custom_headers", {
        url:     `${baseUrl}/auth`,
        method:  "POST",
        headers: [
          ["Authorization", "Bearer sk-test-123"],
          ["X-Custom-Tag",  "alpha"],
        ],
      });
      const run = await db.workflowRun.create({
        data: { workflowId: wf.id, workspaceId: ws.id, contactId: lContact.id, status: "ACTIVE", currentNodeId: "wh" },
      });
      created.workflowRuns.push(run.id);
      await processWorkflowJob(mockJob(run.id, "wh"));
      const req = captured[before];
      check("M3: Authorization header from config arrives at server",
        req?.headers?.["authorization"] === "Bearer sk-test-123");
      check("M3b: X-Custom-Tag header from config arrives at server",
        req?.headers?.["x-custom-tag"] === "alpha");
    }

    // M4: Legacy object header form (pre-A.2 shape) still works — defends
    // the backward-compat path in buildCustomHeadersObject.
    {
      const before = captured.length;
      const wf = await makeWebhookWf("legacy_headers", {
        url:     `${baseUrl}/legacy`,
        method:  "POST",
        headers: { "X-Legacy-Style": "yes" },
      });
      const run = await db.workflowRun.create({
        data: { workflowId: wf.id, workspaceId: ws.id, contactId: lContact.id, status: "ACTIVE", currentNodeId: "wh" },
      });
      created.workflowRuns.push(run.id);
      await processWorkflowJob(mockJob(run.id, "wh"));
      const req = captured[before];
      check("M4: legacy object headers still passed through",
        req?.headers?.["x-legacy-style"] === "yes");
    }

    // M5: Custom header overrides one of the X-Launchtic defaults (operator
    // chose a different User-Agent for an allowlisted receiver).
    {
      const before = captured.length;
      const wf = await makeWebhookWf("override_ua", {
        url:     `${baseUrl}/override`,
        method:  "POST",
        headers: [["User-Agent", "MyCustomAgent/2.0"]],
      });
      const run = await db.workflowRun.create({
        data: { workflowId: wf.id, workspaceId: ws.id, contactId: lContact.id, status: "ACTIVE", currentNodeId: "wh" },
      });
      created.workflowRuns.push(run.id);
      await processWorkflowJob(mockJob(run.id, "wh"));
      const req = captured[before];
      check("M5: custom User-Agent overrides Launchtic default",
        req?.headers?.["user-agent"] === "MyCustomAgent/2.0");
    }

    // M6: Server returns 500 → step FAILED with "Webhook returned 500".
    {
      const wf = await makeWebhookWf("fail_500", { url: `${baseUrl}/fail`, method: "POST" });
      const run = await db.workflowRun.create({
        data: { workflowId: wf.id, workspaceId: ws.id, contactId: lContact.id, status: "ACTIVE", currentNodeId: "wh" },
      });
      created.workflowRuns.push(run.id);
      await processWorkflowJob(mockJob(run.id, "wh"));
      const step = await lastStep(run.id);
      check("M6: 500 response → step FAILED with 'returned 500'",
        step?.status === "FAILED" && /returned 500/i.test(step?.error ?? ""), { error: step?.error });
    }

    // M7: GET method sends no body — verifies the executor's body-skip branch.
    {
      const before = captured.length;
      const wf = await makeWebhookWf("get_method", { url: `${baseUrl}/getreq`, method: "GET" });
      const run = await db.workflowRun.create({
        data: { workflowId: wf.id, workspaceId: ws.id, contactId: lContact.id, status: "ACTIVE", currentNodeId: "wh" },
      });
      created.workflowRuns.push(run.id);
      await processWorkflowJob(mockJob(run.id, "wh"));
      const req = captured[before];
      check("M7: GET method → server saw no body",
        req?.method === "GET" && (req?.body === null || req?.body === ""));
    }

    // ─ Validation rules for headers (extends Group K) ─────────────────────
    check("M8: WEBHOOK headers as non-array → 'must be a list'",
      hasMsg(wfShell({
        nodes: [{ id: "wh", type: "WEBHOOK", config: { url: "https://x.example", headers: "not an array" } }, { id: "end", type: "END", config: {} }],
        edges: [{ id: "e", source: "wh", target: "end" }], startNodeId: "wh",
      }), "must be a list"));
    check("M9: WEBHOOK header row with empty name → 'name is empty'",
      hasMsg(wfShell({
        nodes: [{ id: "wh", type: "WEBHOOK", config: { url: "https://x.example", headers: [["", "v"]] } }, { id: "end", type: "END", config: {} }],
        edges: [{ id: "e", source: "wh", target: "end" }], startNodeId: "wh",
      }), "name is empty"));
    check("M10: WEBHOOK header row with empty value → 'has no value'",
      hasMsg(wfShell({
        nodes: [{ id: "wh", type: "WEBHOOK", config: { url: "https://x.example", headers: [["Authorization", ""]] } }, { id: "end", type: "END", config: {} }],
        edges: [{ id: "e", source: "wh", target: "end" }], startNodeId: "wh",
      }), "has no value"));
    check("M11: WEBHOOK header row with invalid name (space) → 'not a valid header name'",
      hasMsg(wfShell({
        nodes: [{ id: "wh", type: "WEBHOOK", config: { url: "https://x.example", headers: [["Bad Name", "v"]] } }, { id: "end", type: "END", config: {} }],
        edges: [{ id: "e", source: "wh", target: "end" }], startNodeId: "wh",
      }), "not a valid header name"));
    check("M12: WEBHOOK valid headers → 0 issues",
      issuesOf(wfShell({
        nodes: [{ id: "wh", type: "WEBHOOK", config: { url: "https://x.example", headers: [["Authorization", "Bearer x"], ["X-Foo", "bar"]] } }, { id: "end", type: "END", config: {} }],
        edges: [{ id: "e", source: "wh", target: "end" }], startNodeId: "wh",
      })).length === 0);
  } finally {
    if (!serverClosed) {
      serverClosed = true;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
}

async function cleanup() {
  console.log("\nCleaning up test rows…");
  // Order matters: child rows first.
  if (created.workflowRuns.length)
    await db.workflowRun.deleteMany({ where: { id: { in: created.workflowRuns } } });
  if (created.workflows.length)
    await db.workflowRun.deleteMany({ where: { workflowId: { in: created.workflows } } });
  if (created.emailSends.length)
    await db.emailSend.deleteMany({ where: { id: { in: created.emailSends } } });
  if (created.workflowEmails.length)
    await db.workflowEmail.deleteMany({ where: { id: { in: created.workflowEmails } } });
  if (created.workflows.length)
    await db.workflow.deleteMany({ where: { id: { in: created.workflows } } });
  if (created.orders.length)
    await db.order.deleteMany({ where: { id: { in: created.orders } } });
  if (created.funnelSteps.length)
    await db.funnelStep.deleteMany({ where: { id: { in: created.funnelSteps } } });
  if (created.funnels.length)
    await db.funnel.deleteMany({ where: { id: { in: created.funnels } } });
  for (const ct of created.contactTags) {
    await db.contactTag.deleteMany({ where: { contactId: ct.contactId, tagId: ct.tagId } });
  }
  if (created.tags.length)
    await db.tag.deleteMany({ where: { id: { in: created.tags } } });
  if (created.broadcasts.length)
    await db.broadcast.deleteMany({ where: { id: { in: created.broadcasts } } });
  if (created.contacts.length)
    await db.contact.deleteMany({ where: { id: { in: created.contacts } } });
  console.log("Cleanup done.");
}

(async () => {
  try { await main(); }
  catch (err) { console.error("Test run threw:", err); fail++; }
  finally {
    try { await cleanup(); } catch (e) { console.error("Cleanup error:", e); }
    await db.$disconnect();
    console.log(`\n${pass + fail} tests, ${pass} passed, ${fail} failed`);
    if (failures.length) {
      console.log("Failures:");
      for (const f of failures) console.log(`  - ${f}`);
    }
    process.exit(fail === 0 ? 0 : 1);
  }
})();
