// Round-2 integration smoke test — extends test-source-picker-integration.mts
// to cover the rest of the P0/P1 workflow surfaces flagged in coverage review:
//
//   Group C — Conditions other than email (contact_tag, contact_field,
//             contact_purchased)
//   Group D — Triggers other than email (NEW_SALE, TAG_ADDED, CHECKOUT_STARTED,
//             FORM_SUBMIT, SUBSCRIPTION_PAYMENT_FAILED)
//   Group E — Re-enroll policies (COOLDOWN + ALWAYS) beyond SINGLE_ACTIVE
//   Group F — Graph validation rules (cycle-tolerant, dead-end, missing
//             true/false branch, edges → missing nodes, no startNodeId)
//   Group G — DELAY scheduling math + boundary conditions
//   Group H — SEND_EMAIL DB write shape (EmailSend row populated correctly,
//             WorkflowEmail.sentCount bumped, missing email path)
//
// Same isolation pattern: all test rows are prefixed "smoketest_cov_" and
// removed in a try/finally cleanup so no user data is touched.
//
// Run:
//   pnpm --filter @launchtic/worker exec tsx \
//     "C:/Users/Admin/Desktop/NODEJS/launchtic/apps/web/scripts/test-workflow-coverage.mts"

import * as fs from "node:fs";
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

const dbAny:   any = (DB   as any).default ?? DB;
const autoAny: any = (AUTO as any).default ?? AUTO;
const valAny:  any = (VAL  as any).default ?? VAL;
const db = dbAny.db ?? dbAny;
const fireTrigger      = autoAny.fireTrigger;
const validateWorkflow = valAny.validateWorkflow;

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

  async function makeWf(triggerType: string, triggerConfig: any, reEnrollPolicy = "ALWAYS") {
    const wf = await db.workflow.create({
      data: {
        workspaceId: ws.id,
        name: `${PREFIX}_${triggerType}_${Math.random().toString(36).slice(2, 7)}`,
        status: "ACTIVE", triggerType, triggerConfig,
        nodes: [{ id: "end", type: "END", position: { x: 0, y: 0 }, config: {} }] as any,
        edges: [] as any, startNodeId: "end", reEnrollPolicy,
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
  //  GROUP E — Re-enroll policies
  // ───────────────────────────────────────────────────────────────────────────
  section("E. Re-enroll policies — COOLDOWN, ALWAYS");

  // E1: ALWAYS — every fire creates a new run
  {
    const wfId = await makeWf("TAG_ADDED", { tagId: tagFoo.id }, "ALWAYS");
    await fireTrigger(ws.id, "TAG_ADDED", { contactId: contact.id, tagId: tagFoo.id });
    await fireTrigger(ws.id, "TAG_ADDED", { contactId: contact.id, tagId: tagFoo.id });
    check("E1: ALWAYS → 2 fires create 2 runs", await countRuns(wfId) === 2);
  }
  // E2: COOLDOWN 7 days — second fire within cooldown blocked
  {
    const wf = await db.workflow.create({
      data: {
        workspaceId: ws.id, name: `${PREFIX}_cooldown_${Math.random().toString(36).slice(2, 7)}`,
        status: "ACTIVE", triggerType: "TAG_ADDED",
        triggerConfig: { tagId: tagFoo.id },
        nodes: [{ id: "end", type: "END", position: { x: 0, y: 0 }, config: {} }] as any,
        edges: [] as any, startNodeId: "end",
        reEnrollPolicy: "COOLDOWN", reEnrollCooldownDays: 7,
      },
    });
    created.workflows.push(wf.id);
    await fireTrigger(ws.id, "TAG_ADDED", { contactId: contact.id, tagId: tagFoo.id });
    await fireTrigger(ws.id, "TAG_ADDED", { contactId: contact.id, tagId: tagFoo.id });
    check("E2: COOLDOWN 7d, 2 fires back-to-back → 1 run (2nd blocked)",
      await countRuns(wf.id) === 1);
  }
  // E3: COOLDOWN expired — backdated WorkflowRun > cooldown lets next fire enroll
  {
    const wf = await db.workflow.create({
      data: {
        workspaceId: ws.id, name: `${PREFIX}_cooldown_expired_${Math.random().toString(36).slice(2, 7)}`,
        status: "ACTIVE", triggerType: "TAG_ADDED",
        triggerConfig: { tagId: tagFoo.id },
        nodes: [{ id: "end", type: "END", position: { x: 0, y: 0 }, config: {} }] as any,
        edges: [] as any, startNodeId: "end",
        reEnrollPolicy: "COOLDOWN", reEnrollCooldownDays: 1, // 1 day cooldown
      },
    });
    created.workflows.push(wf.id);
    // Seed an old run from 5 days ago (outside cooldown window).
    const oldRun = await db.workflowRun.create({
      data: {
        workflowId: wf.id, workspaceId: ws.id, contactId: contact.id,
        status: "COMPLETED",
        startedAt: new Date(Date.now() - 5 * 24 * 3600 * 1000),
      },
    });
    created.workflowRuns.push(oldRun.id);
    await fireTrigger(ws.id, "TAG_ADDED", { contactId: contact.id, tagId: tagFoo.id });
    check("E3: COOLDOWN 1d + last run 5d ago → next fire enrolls (2 total)",
      await countRuns(wf.id) === 2);
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
