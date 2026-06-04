// Integration smoke test for the re-fire policy.
//
// Covers the runtime gate in fireTrigger (apps/web/lib/automations.ts +
// renderer twin): "every" allows re-enrollment after a previous run reaches
// COMPLETED; "once" blocks any subsequent enrollment for the same contact
// regardless of the prior run's status.

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

const dbAny:   any = (DB   as any).default ?? DB;
const autoAny: any = (AUTO as any).default ?? AUTO;
const db = dbAny.db ?? dbAny;
const fireTrigger = autoAny.fireTrigger;

const PREFIX = "smoketest_refire";

let pass = 0, fail = 0;
const failures: string[] = [];
function check(label: string, ok: boolean, extra?: unknown) {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else    { fail++; failures.push(label); console.log(`  ✗ ${label}`, extra ?? ""); }
}

const created = {
  workflowRuns: [] as string[],
  workflows:    [] as string[],
  tags:         [] as string[],
  contacts:     [] as string[],
};

async function main() {
  const ws = await db.workspace.findFirst({ select: { id: true } });
  if (!ws) { console.error("FATAL: no workspace."); process.exit(2); }

  const contact = await db.contact.create({
    data: { workspaceId: ws.id, email: `${PREFIX}_contact@example.test` },
  });
  created.contacts.push(contact.id);

  const tag = await db.tag.create({
    data: { workspaceId: ws.id, name: `${PREFIX}_trigger_tag` },
  });
  created.tags.push(tag.id);

  // Helper: minimal ACTIVE workflow targeting TAG_ADDED on a specific tag.
  async function makeWorkflow(reFirePolicy: "every" | "once"): Promise<string> {
    const wf = await db.workflow.create({
      data: {
        workspaceId: ws.id,
        name:    `${PREFIX}_${reFirePolicy}_${Math.random().toString(36).slice(2, 8)}`,
        status:  "ACTIVE",
        triggerType:   "TAG_ADDED",
        triggerConfig: { tagId: tag.id },
        nodes: [{ id: "end", type: "END", position: { x: 0, y: 0 }, config: {} }] as any,
        edges: [] as any,
        startNodeId: "end",
        reFirePolicy,
      },
    });
    created.workflows.push(wf.id);
    return wf.id;
  }

  const countRuns = (wfId: string) => db.workflowRun.count({ where: { workflowId: wfId } });

  console.log("\nRe-fire policy = 'every' (default for transactional)");

  // every: blocks while ACTIVE, allows after COMPLETED.
  const wfEvery = await makeWorkflow("every");

  // Fire #1 → new run created (status defaults to ACTIVE).
  await fireTrigger(ws.id, "TAG_ADDED", { contactId: contact.id, tagId: tag.id });
  check("every: 1st fire → 1 run", await countRuns(wfEvery) === 1);

  // Fire #2 immediately → blocked because prior run is still ACTIVE.
  await fireTrigger(ws.id, "TAG_ADDED", { contactId: contact.id, tagId: tag.id });
  check("every: 2nd fire while ACTIVE → still 1 run (SINGLE_ACTIVE)",
    await countRuns(wfEvery) === 1);

  // Mark the prior run COMPLETED, fire again → new run allowed.
  await db.workflowRun.updateMany({
    where: { workflowId: wfEvery },
    data:  { status: "COMPLETED" },
  });
  await fireTrigger(ws.id, "TAG_ADDED", { contactId: contact.id, tagId: tag.id });
  check("every: fire after COMPLETED → 2 runs (re-enroll allowed)",
    await countRuns(wfEvery) === 2);

  console.log("\nRe-fire policy = 'once' (welcome / lead-magnet pattern)");

  const wfOnce = await makeWorkflow("once");

  // Fire #1 → run created.
  await fireTrigger(ws.id, "TAG_ADDED", { contactId: contact.id, tagId: tag.id });
  check("once: 1st fire → 1 run", await countRuns(wfOnce) === 1);

  // Fire #2 immediately → blocked (ANY prior run).
  await fireTrigger(ws.id, "TAG_ADDED", { contactId: contact.id, tagId: tag.id });
  check("once: 2nd fire while ACTIVE → still 1 run",
    await countRuns(wfOnce) === 1);

  // Mark the prior run COMPLETED, fire again → STILL blocked.
  await db.workflowRun.updateMany({
    where: { workflowId: wfOnce },
    data:  { status: "COMPLETED" },
  });
  await fireTrigger(ws.id, "TAG_ADDED", { contactId: contact.id, tagId: tag.id });
  check("once: fire after COMPLETED → still 1 run (re-enroll blocked)",
    await countRuns(wfOnce) === 1);

  // Different contact: 'once' is per-contact, not per-workflow.
  const other = await db.contact.create({
    data: { workspaceId: ws.id, email: `${PREFIX}_other@example.test` },
  });
  created.contacts.push(other.id);
  await fireTrigger(ws.id, "TAG_ADDED", { contactId: other.id, tagId: tag.id });
  check("once: different contact → enrolls (per-contact scope)",
    await countRuns(wfOnce) === 2);
}

async function cleanup() {
  console.log("\nCleaning up…");
  if (created.workflows.length)
    await db.workflowRun.deleteMany({ where: { workflowId: { in: created.workflows } } });
  if (created.workflows.length)
    await db.workflow.deleteMany({ where: { id: { in: created.workflows } } });
  if (created.tags.length)
    await db.tag.deleteMany({ where: { id: { in: created.tags } } });
  if (created.contacts.length)
    await db.contact.deleteMany({ where: { id: { in: created.contacts } } });
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
