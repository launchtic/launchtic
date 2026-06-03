// Verify every template's SEND_EMAIL bodyHtml is now a valid maily JSON doc
// matching what renderEmailContent in @launchtic/email expects.
// Also walk the doc to make sure isMailyDocEmpty() in workflow-validation
// won't flag any of them as empty.

// @ts-ignore
import * as M from "file:///C:/Users/Admin/Desktop/NODEJS/launchtic/apps/web/lib/workflow-templates.ts";

const mod: any = (M as any).default ?? M;
const templates: any[] = mod.WORKFLOW_TEMPLATES;

let pass = 0, fail = 0;
function check(label: string, ok: boolean, extra?: unknown) {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else    { fail++; console.log(`  ✗ ${label}`, extra ?? ""); }
}

function isMailyDocEmpty(raw: string): boolean {
  const s = raw.trim();
  if (!s) return true;
  if (!s.startsWith("{")) return false;
  let json: any;
  try { json = JSON.parse(s); } catch { return true; }
  const stack: any[] = [json];
  while (stack.length) {
    const n = stack.pop();
    if (!n || typeof n !== "object") continue;
    if (typeof n.text === "string" && n.text.trim().length > 0) return false;
    if (n.type === "image" || n.type === "button" || n.type === "logo") return false;
    if (Array.isArray(n.content)) for (const c of n.content) stack.push(c);
  }
  return true;
}

console.log(`Checking ${templates.length} templates…\n`);
let totalEmails = 0;

for (const tpl of templates) {
  const emails = tpl.nodes.filter((n: any) => n.type === "SEND_EMAIL");
  for (const e of emails) {
    totalEmails++;
    const body = e.config?.bodyHtml ?? "";
    const subj = e.config?.subject ?? "";
    const label = `${tpl.id} :: ${e.id}`;

    // 1. Starts with `{` (required by renderEmailContent)
    check(`${label}: starts with "{"`, typeof body === "string" && body.startsWith("{"));

    // 2. Valid JSON
    let json: any;
    try {
      json = JSON.parse(body);
      check(`${label}: valid JSON`, true);
    } catch (err) {
      check(`${label}: valid JSON`, false, err);
      continue;
    }

    // 3. Shape = { type: "doc", content: [...] }
    check(`${label}: doc shape`, json?.type === "doc" && Array.isArray(json?.content));

    // 4. Not empty per the validation rule
    check(`${label}: non-empty doc`, !isMailyDocEmpty(body));

    // 5. Subject non-empty
    check(`${label}: subject set`, typeof subj === "string" && subj.length > 0);
  }
}

console.log(`\n${pass + fail} checks across ${totalEmails} emails, ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
