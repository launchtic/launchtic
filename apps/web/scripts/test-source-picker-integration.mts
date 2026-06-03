// Integration smoke test for the email source picker / linkUrl feature.
//
// Hits a real Postgres + uses the real Prisma client. Two surfaces covered:
//
//   A. fireTrigger pipeline (uses the renderer's fireTrigger function) —
//      seed an ACTIVE Workflow with various trigger configs, simulate a
//      pixel/click event, observe whether a WorkflowRun row appears.
//
//   B. execCondition query — re-implement the EXACT Prisma query from
//      apps/worker/src/queues/workflow.ts execCondition (the function is
//      private; the query is what we actually want to verify against a
//      real DB schema). Seeds EmailSend rows with various
//      broadcastId/workflowEmailId/openedAt combinations and verifies the
//      query returns the right boolean for each source discriminator.
//
// Test data is namespaced under unique cuids and a "smoketest:" prefix on
// names so a cleanup pass at the end (try/finally) removes everything we
// touched. Existing workspace data is never modified — we reuse an existing
// workspace id only for FK satisfaction.
//
// Run:
//   pnpm --filter @launchtic/worker exec tsx \
//     "C:/Users/Admin/Desktop/NODEJS/launchtic/apps/web/scripts/test-source-picker-integration.mts"

// Load DATABASE_URL/REDIS_URL from the repo root .env before importing
// anything that touches Prisma or BullMQ. tsx scripts don't get Next.js's
// automatic .env loading; lighter than depending on dotenv from a script.
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
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}

// @ts-ignore
import * as DB from "file:///C:/Users/Admin/Desktop/NODEJS/launchtic/packages/database/src/index.ts";
// @ts-ignore
import * as AUTO from "file:///C:/Users/Admin/Desktop/NODEJS/launchtic/apps/renderer/lib/automations.ts";

// Some tsx/Node configs expose named exports under `.default` only; reach
// through both shapes so the script is portable.
const dbAny: any = (DB as any).default ?? DB;
const db = dbAny.db ?? dbAny;
const autoAny: any = (AUTO as any).default ?? AUTO;
const fireTrigger = autoAny.fireTrigger;

if (!db?.workspace) {
  console.error("FATAL: db import failed. Keys:", Object.keys(dbAny));
  process.exit(2);
}
if (typeof fireTrigger !== "function") {
  console.error("FATAL: fireTrigger import failed. Keys:", Object.keys(autoAny));
  process.exit(2);
}

const PREFIX = "smoketest_src_picker";
const NOW    = new Date();
const PAST   = new Date(NOW.getTime() - 60 * 60 * 1000);     // 1h ago
const FAR_PAST = new Date(NOW.getTime() - 24 * 60 * 60 * 1000); // 24h ago

let pass = 0, fail = 0;
const failures: string[] = [];
function check(label: string, ok: boolean, extra?: unknown) {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else    { fail++; failures.push(label); console.log(`  ✗ ${label}`, extra ?? ""); }
}
function section(title: string) { console.log(`\n${title}`); }

// Track every row we insert so cleanup is deterministic.
const created = {
  workflowRuns:    [] as string[],
  emailSends:      [] as string[],
  workflows:       [] as string[],
  workflowEmails:  [] as string[],
  broadcasts:      [] as string[],
  contacts:        [] as string[],
};

async function main() {
  // ─── Bootstrap: find or fail-fast on a workspace to attach FKs to ─────────
  const ws = await db.workspace.findFirst({ select: { id: true, name: true } });
  if (!ws) {
    console.error("FATAL: no workspace in DB. Create one in the dev app first.");
    process.exit(2);
  }
  console.log(`Using workspace "${ws.name}" (${ws.id}) — test data namespaced under "${PREFIX}*"`);

  // ─── Shared test entities ──────────────────────────────────────────────────
  const contact = await db.contact.create({
    data: {
      workspaceId: ws.id,
      email: `${PREFIX}_contact@example.test`,
      firstName: "Smoke",
    },
  });
  created.contacts.push(contact.id);

  const broadcastA = await db.broadcast.create({
    data: {
      workspaceId: ws.id,
      name:    `${PREFIX}_broadcast_A`,
      subject: "Broadcast A",
      htmlBody: `<a href="https://app.test/checkout/promo">Buy</a> <a href="https://app.test/blog">Read</a>`,
      fromName:  "Test",
      fromEmail: "test@example.test",
    },
  });
  created.broadcasts.push(broadcastA.id);

  const broadcastB = await db.broadcast.create({
    data: {
      workspaceId: ws.id,
      name:    `${PREFIX}_broadcast_B`,
      subject: "Broadcast B",
      htmlBody: `<a href="https://app.test/other">Other</a>`,
      fromName:  "Test",
      fromEmail: "test@example.test",
    },
  });
  created.broadcasts.push(broadcastB.id);

  // ─── Group A: fireTrigger pipeline ─────────────────────────────────────────
  // For each scenario: create an ACTIVE workflow with the trigger config,
  // call fireTrigger with a context, then count WorkflowRun rows for that
  // workflow. Cleanup the workflow + any runs afterwards.

  section("A. fireTrigger pipeline — EMAIL_OPENED");

  // A workflow needs a startNodeId pointing to a valid node. We use a
  // minimal stub: one END node. Worker would try to enqueue a step job —
  // Redis is running, the job will sit unprocessed since the worker isn't
  // running this script. WorkflowRun row is what we assert.
  async function makeWorkflow(triggerType: string, triggerConfig: any): Promise<string> {
    const nodes = [{ id: "end", type: "END", position: { x: 0, y: 0 }, config: {} }];
    const wf = await db.workflow.create({
      data: {
        workspaceId: ws.id,
        name: `${PREFIX}_${triggerType}_${Math.random().toString(36).slice(2, 8)}`,
        status: "ACTIVE",
        triggerType,
        triggerConfig,
        nodes: nodes as any,
        edges: [] as any,
        startNodeId: "end",
        reEnrollPolicy: "ALWAYS", // so re-enroll doesn't interfere with A1/A2/A3
      },
    });
    created.workflows.push(wf.id);
    return wf.id;
  }

  async function countRuns(workflowId: string): Promise<number> {
    return db.workflowRun.count({ where: { workflowId } });
  }

  // A1: source=broadcast match → run created
  {
    const wfId = await makeWorkflow("EMAIL_OPENED", { source: "broadcast", broadcastId: broadcastA.id });
    await fireTrigger(ws.id, "EMAIL_OPENED", {
      contactId: contact.id,
      broadcastId: broadcastA.id,
    });
    const n = await countRuns(wfId);
    check("A1: source=broadcast match → 1 run created", n === 1, { count: n });
  }

  // A2: source=broadcast WRONG id → no run
  {
    const wfId = await makeWorkflow("EMAIL_OPENED", { source: "broadcast", broadcastId: broadcastA.id });
    await fireTrigger(ws.id, "EMAIL_OPENED", {
      contactId: contact.id,
      broadcastId: broadcastB.id,   // different from configured
    });
    const n = await countRuns(wfId);
    check("A2: broadcastId mismatch → 0 runs", n === 0, { count: n });
  }

  // A3: source=workflow_email match (cross-workflow chain)
  // Seed a WorkflowEmail belonging to a DIFFERENT workflow ("upstream")
  // that the trigger watches.
  const upstreamWorkflow = await makeWorkflow("TAG_ADDED", { tagId: "irrelevant" }); // just a parent
  const upstreamEmail = await db.workflowEmail.create({
    data: {
      workspaceId: ws.id,
      workflowId:  upstreamWorkflow,
      subject:     "Upstream email",
      bodyHtml:    "<a href='https://app.test/cta'>CTA</a>",
      fromName:    "Test",
      fromEmail:   "test@example.test",
    },
  });
  created.workflowEmails.push(upstreamEmail.id);

  {
    const wfId = await makeWorkflow("EMAIL_OPENED", { source: "workflow_email", workflowEmailId: upstreamEmail.id });
    await fireTrigger(ws.id, "EMAIL_OPENED", {
      contactId: contact.id,
      workflowEmailId: upstreamEmail.id,
    });
    const n = await countRuns(wfId);
    check("A3: source=workflow_email match → 1 run (cross-workflow chain)", n === 1, { count: n });
  }

  // A4: source=workflow_email WRONG id → no run
  {
    const wfId = await makeWorkflow("EMAIL_OPENED", { source: "workflow_email", workflowEmailId: upstreamEmail.id });
    await fireTrigger(ws.id, "EMAIL_OPENED", {
      contactId: contact.id,
      workflowEmailId: "other-email-id-that-does-not-exist",
    });
    const n = await countRuns(wfId);
    check("A4: workflowEmailId mismatch → 0 runs", n === 0, { count: n });
  }

  section("A. fireTrigger pipeline — EMAIL_LINK_CLICKED + linkUrl");

  // A5: linkUrl filter matches (contains-match)
  {
    const wfId = await makeWorkflow("EMAIL_LINK_CLICKED", {
      source: "broadcast", broadcastId: broadcastA.id, linkUrl: "/checkout",
    });
    await fireTrigger(ws.id, "EMAIL_LINK_CLICKED", {
      contactId: contact.id,
      broadcastId: broadcastA.id,
      linkUrl: "https://app.test/checkout/promo?utm=spring",
    });
    const n = await countRuns(wfId);
    check("A5: linkUrl substring matches → 1 run", n === 1, { count: n });
  }

  // A6: linkUrl filter does NOT match
  {
    const wfId = await makeWorkflow("EMAIL_LINK_CLICKED", {
      source: "broadcast", broadcastId: broadcastA.id, linkUrl: "/checkout",
    });
    await fireTrigger(ws.id, "EMAIL_LINK_CLICKED", {
      contactId: contact.id,
      broadcastId: broadcastA.id,
      linkUrl: "https://app.test/blog/article",   // doesn't contain "/checkout"
    });
    const n = await countRuns(wfId);
    check("A6: linkUrl no match → 0 runs", n === 0, { count: n });
  }

  // A7: no linkUrl filter, any click fires
  {
    const wfId = await makeWorkflow("EMAIL_LINK_CLICKED", {
      source: "broadcast", broadcastId: broadcastA.id,  // no linkUrl
    });
    await fireTrigger(ws.id, "EMAIL_LINK_CLICKED", {
      contactId: contact.id,
      broadcastId: broadcastA.id,
      linkUrl: "https://anything.com/wherever",
    });
    const n = await countRuns(wfId);
    check("A7: no linkUrl filter → any click fires (1 run)", n === 1, { count: n });
  }

  // A8: re-enroll SINGLE_ACTIVE blocks 2nd fire while 1st run is ACTIVE
  {
    const wf = await db.workflow.create({
      data: {
        workspaceId: ws.id,
        name: `${PREFIX}_reenroll`,
        status: "ACTIVE",
        triggerType: "EMAIL_OPENED",
        triggerConfig: { source: "broadcast", broadcastId: broadcastA.id },
        nodes: [{ id: "end", type: "END", position: { x: 0, y: 0 }, config: {} }] as any,
        edges: [] as any,
        startNodeId: "end",
        reEnrollPolicy: "SINGLE_ACTIVE",
      },
    });
    created.workflows.push(wf.id);
    await fireTrigger(ws.id, "EMAIL_OPENED", { contactId: contact.id, broadcastId: broadcastA.id });
    await fireTrigger(ws.id, "EMAIL_OPENED", { contactId: contact.id, broadcastId: broadcastA.id });
    const n = await countRuns(wf.id);
    check("A8: SINGLE_ACTIVE re-enroll blocks 2nd fire → 1 run only", n === 1, { count: n });
  }

  // ─── Group B: execCondition query against real DB ─────────────────────────
  // Re-implements the exact Prisma query from worker/queues/workflow.ts so
  // we exercise schema + indexes + data shape end-to-end. If the worker
  // query drifts from this, typecheck catches column-level drift; behavior
  // drift would show up in manual testing.

  section("B. execCondition query — email_opened / email_clicked");

  // Seed scenario:
  //   run.startedAt = PAST (1h ago)
  //   sendOpenedRecent       — openedAt = halfway (between PAST and NOW)  → after start
  //   sendClickedRecent      — clickedAt = halfway                        → after start
  //   sendOpenedTooOld       — openedAt = FAR_PAST (24h ago)              → before start
  //   sendDifferentBroadcast — broadcastId = B (workflow watches A)
  //   sendWorkflowEmail      — workflowEmailId = upstreamEmail.id, opened recent
  const halfway = new Date(PAST.getTime() + 30 * 60 * 1000); // 30 min ago

  const sendOpenedRecent = await db.emailSend.create({
    data: {
      workspaceId: ws.id,
      contactId:   contact.id,
      toEmail:     contact.email,
      subject:     "Test recent open",
      status:      "SENT",
      broadcastId: broadcastA.id,
      sentAt:      PAST,
      openedAt:    halfway,
      openCount:   1,
    },
  });
  created.emailSends.push(sendOpenedRecent.id);

  const sendClickedRecent = await db.emailSend.create({
    data: {
      workspaceId: ws.id,
      contactId:   contact.id,
      toEmail:     contact.email,
      subject:     "Test recent click",
      status:      "SENT",
      broadcastId: broadcastA.id,
      sentAt:      PAST,
      clickedAt:   halfway,
      clickCount:  1,
    },
  });
  created.emailSends.push(sendClickedRecent.id);

  const sendOpenedTooOld = await db.emailSend.create({
    data: {
      workspaceId: ws.id,
      contactId:   contact.id,
      toEmail:     contact.email,
      subject:     "Test old open",
      status:      "SENT",
      broadcastId: broadcastB.id,    // also pair with a different broadcast
      sentAt:      FAR_PAST,
      openedAt:    FAR_PAST,
      openCount:   1,
    },
  });
  created.emailSends.push(sendOpenedTooOld.id);

  const sendWorkflowEmail = await db.emailSend.create({
    data: {
      workspaceId:     ws.id,
      contactId:       contact.id,
      toEmail:         contact.email,
      subject:         "Workflow email open",
      status:          "SENT",
      workflowEmailId: upstreamEmail.id,
      sentAt:          PAST,
      openedAt:        halfway,
      openCount:       1,
    },
  });
  created.emailSends.push(sendWorkflowEmail.id);

  // The query mirror — keep the WHERE shape EXACTLY as in execCondition.
  // source="any" was removed; this mirror also drops it so the test exercises
  // what the worker actually accepts.
  async function condQuery(
    kind: "email_opened" | "email_clicked",
    cfg:  { source: "broadcast" | "workflow_email"; broadcastId?: string; workflowEmailId?: string },
    runStartedAt: Date,
  ): Promise<boolean> {
    const where: Record<string, unknown> = { contactId: contact.id };
    if (cfg.source === "broadcast") {
      if (!cfg.broadcastId) return false;
      where.broadcastId = cfg.broadcastId;
    } else if (cfg.source === "workflow_email") {
      if (!cfg.workflowEmailId) return false;
      where.workflowEmailId = cfg.workflowEmailId;
    } else {
      return false;
    }
    const dateField = kind === "email_opened" ? "openedAt" : "clickedAt";
    where[dateField] = { gte: runStartedAt };
    const send = await db.emailSend.findFirst({ where, select: { id: true } });
    return !!send;
  }

  // B1: source=broadcast match
  check("B1: email_opened source=broadcast A + recent open on A → true",
    await condQuery("email_opened", { source: "broadcast", broadcastId: broadcastA.id }, PAST) === true);

  // B2: source=broadcast but configured for B (only old open exists there)
  check("B2: email_opened source=broadcast B (only old open) since PAST → false",
    await condQuery("email_opened", { source: "broadcast", broadcastId: broadcastB.id }, PAST) === false);

  // B3: source=workflow_email match
  check("B3: email_opened source=workflow_email upstream + recent open → true",
    await condQuery("email_opened", { source: "workflow_email", workflowEmailId: upstreamEmail.id }, PAST) === true);

  // B4: time window — open happened BEFORE run.startedAt
  // halfway is 30m ago; broadcastA's open is at halfway. A run that started
  // 30m in the future sees no past opens (since=futurePoint > halfway).
  const futurePoint = new Date(NOW.getTime() + 30 * 60 * 1000);
  check("B4: email_opened time window — open before run.startedAt → false",
    await condQuery("email_opened", { source: "broadcast", broadcastId: broadcastA.id }, futurePoint) === false);

  // B5: email_clicked source=broadcast A catches recent click
  check("B5: email_clicked source=broadcast A + recent click on A → true",
    await condQuery("email_clicked", { source: "broadcast", broadcastId: broadcastA.id }, PAST) === true);

  // B6: contact isolation — different contact must not match
  const otherContact = await db.contact.create({
    data: {
      workspaceId: ws.id,
      email: `${PREFIX}_contact2@example.test`,
    },
  });
  created.contacts.push(otherContact.id);
  const otherContactQuery = await db.emailSend.findFirst({
    where: {
      contactId: otherContact.id,
      broadcastId: broadcastA.id,
      openedAt: { gte: PAST },
    },
    select: { id: true },
  });
  check("B6: contact isolation — different contact has no engagement", otherContactQuery == null);
}

// ─── Cleanup ──────────────────────────────────────────────────────────────
async function cleanup() {
  console.log("\nCleaning up test rows…");
  // Order matters: child rows first (FK cascade for some, but we delete by id
  // we tracked to be explicit and never touch user data).
  if (created.workflowRuns.length) {
    await db.workflowRun.deleteMany({ where: { id: { in: created.workflowRuns } } });
  }
  // WorkflowRun rows created indirectly via fireTrigger: delete by workflowId
  if (created.workflows.length) {
    await db.workflowRun.deleteMany({ where: { workflowId: { in: created.workflows } } });
  }
  if (created.emailSends.length) {
    await db.emailSend.deleteMany({ where: { id: { in: created.emailSends } } });
  }
  if (created.workflowEmails.length) {
    await db.workflowEmail.deleteMany({ where: { id: { in: created.workflowEmails } } });
  }
  if (created.workflows.length) {
    await db.workflow.deleteMany({ where: { id: { in: created.workflows } } });
  }
  if (created.broadcasts.length) {
    await db.broadcast.deleteMany({ where: { id: { in: created.broadcasts } } });
  }
  if (created.contacts.length) {
    await db.contact.deleteMany({ where: { id: { in: created.contacts } } });
  }
  console.log("Cleanup done.");
}

(async () => {
  try {
    await main();
  } catch (err) {
    console.error("Test run threw:", err);
    fail++;
  } finally {
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
