// Sanity-check each template email actually renders through @maily-to/render
// without throwing. Catches subtle node shape errors (wrong attrs on button,
// missing content arrays in lists, etc) that JSON validation alone misses.

// @ts-ignore
import * as M from "file:///C:/Users/Admin/Desktop/NODEJS/launchtic/apps/web/lib/workflow-templates.ts";

const mod: any = (M as any).default ?? M;
const templates: any[] = mod.WORKFLOW_TEMPLATES;

const { render } = await import("@maily-to/render");

let pass = 0, fail = 0;
const failures: string[] = [];

for (const tpl of templates) {
  const emails = tpl.nodes.filter((n: any) => n.type === "SEND_EMAIL");
  for (const e of emails) {
    const label = `${tpl.id} :: ${e.id}`;
    try {
      const json = JSON.parse(e.config.bodyHtml);
      const html = await render(json);
      if (typeof html !== "string" || html.length < 50) {
        throw new Error(`render returned suspiciously short output (${typeof html}, ${html?.length ?? 0} chars)`);
      }
      pass++;
      console.log(`  ✓ ${label} (${html.length} chars)`);
    } catch (err: any) {
      fail++;
      failures.push(`${label}: ${err?.message ?? err}`);
      console.log(`  ✗ ${label}: ${err?.message ?? err}`);
    }
  }
}

console.log(`\n${pass + fail} emails rendered, ${pass} pass, ${fail} fail`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(fail === 0 ? 0 : 1);
