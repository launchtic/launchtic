// Standalone smoke test for the email source picker / linkUrl feature.
// Imports validateWorkflow + validateTrigger from the real shared module so
// regressions in the production code paths get caught. Uses absolute path
// import to dodge cross-package tsx resolution quirks in this monorepo.
//
// Run:  pnpm --filter @launchtic/worker exec tsx <absolute-path-to-this-file>

// @ts-ignore — tsx resolves the TS file at runtime; TS path-resolution
// disagrees but the script never gets typechecked, only executed.
import * as W from "file:///C:/Users/Admin/Desktop/NODEJS/launchtic/apps/web/lib/workflow-validation.ts";

// In some tsx/Node configs `import *` over a TS file exposes only `default`;
// in that case the actual named exports hang off `.default`. Reach through
// the most-permissive path so both shapes work.
const exports = (W as any).default ?? W;
const { validateWorkflow, validateTrigger } = exports as {
  validateWorkflow: (wf: any) => Array<{ nodeId: string | null; nodeLabel: string; messages: string[] }>;
  validateTrigger:  (type: string, config: Record<string, unknown>) => string[];
};

if (typeof validateTrigger !== "function") {
  console.error("FATAL: validateTrigger import failed.");
  console.error("Keys on W:", Object.keys(W));
  console.error("Keys on exports:", Object.keys(exports));
  process.exit(2);
}

let pass = 0, fail = 0;
function check(label: string, ok: boolean, extra?: unknown) {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else    { fail++; console.log(`  ✗ ${label}`, extra ?? ""); }
}
function section(title: string) {
  console.log(`\n${title}`);
}

// Helper: pull condition-node-specific issues from a full validateWorkflow
// call (so we exercise the real public surface, not a private symbol).
function validateNode(type: string, config: Record<string, unknown>): string[] {
  const issues = validateWorkflow({
    triggerType:   "TAG_ADDED",
    triggerConfig: { tagId: "any" },
    nodes:         [
      { id: "x", type, config },
      { id: "end", type: "END", config: {} },
    ],
    edges: [
      { id: "e1", source: "x", target: "end", label: "true"  },
      { id: "e2", source: "x", target: "end", label: "false" },
    ],
    startNodeId: "x",
  });
  return issues.find((i) => i.nodeId === "x")?.messages ?? [];
}

// ─── 1. Trigger validation ──────────────────────────────────────────────────
section("Trigger validation — EMAIL_OPENED");

check(
  "no source → error",
  validateTrigger("EMAIL_OPENED", {}).some((m) => m.includes("Pick an email source")),
);
check(
  "source=broadcast no id → error",
  validateTrigger("EMAIL_OPENED", { source: "broadcast" })
    .some((m) => m.includes("Pick which broadcast")),
);
check(
  "source=broadcast + id → ok",
  validateTrigger("EMAIL_OPENED", { source: "broadcast", broadcastId: "b1" }).length === 0,
);
check(
  "source=workflow_email no id → error",
  validateTrigger("EMAIL_OPENED", { source: "workflow_email" })
    .some((m) => m.includes("Pick which workflow email")),
);
check(
  "source=workflow_email + id → ok",
  validateTrigger("EMAIL_OPENED", { source: "workflow_email", workflowEmailId: "we1" }).length === 0,
);
check(
  "unknown source → error",
  validateTrigger("EMAIL_OPENED", { source: "garbage" })
    .some((m) => m.includes("isn't supported")),
);

section("Trigger validation — EMAIL_LINK_CLICKED + linkUrl");

check(
  "no linkUrl → ok (omit = any link)",
  validateTrigger("EMAIL_LINK_CLICKED", {
    source: "broadcast", broadcastId: "b1",
  }).length === 0,
);
check(
  "linkUrl = empty string → error",
  validateTrigger("EMAIL_LINK_CLICKED", {
    source: "broadcast", broadcastId: "b1", linkUrl: "",
  }).some((m) => m.includes("Link filter is empty")),
);
check(
  "linkUrl = full URL → ok",
  validateTrigger("EMAIL_LINK_CLICKED", {
    source: "broadcast", broadcastId: "b1", linkUrl: "https://app.com/checkout",
  }).length === 0,
);
check(
  "linkUrl = path → ok",
  validateTrigger("EMAIL_LINK_CLICKED", {
    source: "broadcast", broadcastId: "b1", linkUrl: "/welcome",
  }).length === 0,
);
check(
  "linkUrl = garbage (no slash, no http) → error",
  validateTrigger("EMAIL_LINK_CLICKED", {
    source: "broadcast", broadcastId: "b1", linkUrl: "abc",
  }).some((m) => m.includes("must be a URL or URL substring")),
);

// ─── 2. Condition validation ────────────────────────────────────────────────
section("Condition validation — email_opened / email_clicked");

for (const kind of ["email_opened", "email_clicked"] as const) {
  check(
    `${kind}: no source → error`,
    validateNode("CONDITION", { kind })
      .some((m) => m.includes("Pick an email source")),
  );
  check(
    `${kind}: source=any → ok`,
    validateNode("CONDITION", { kind, source: "any" }).length === 0,
  );
  check(
    `${kind}: source=broadcast no id → error`,
    validateNode("CONDITION", { kind, source: "broadcast" })
      .some((m) => m.includes("Pick which broadcast")),
  );
  check(
    `${kind}: source=broadcast + id → ok`,
    validateNode("CONDITION", { kind, source: "broadcast", broadcastId: "b1" }).length === 0,
  );
  check(
    `${kind}: source=workflow_email no id → error`,
    validateNode("CONDITION", { kind, source: "workflow_email" })
      .some((m) => m.includes("Pick which workflow email")),
  );
  check(
    `${kind}: source=workflow_email + id → ok`,
    validateNode("CONDITION", { kind, source: "workflow_email", workflowEmailId: "we1" }).length === 0,
  );
}

// ─── 3. extractLinks (logic-equivalent to /api/.../email-links) ────────────
section("extractLinks — dedup, skip unsubscribe / mailto / anchor");

const HREF_RE = /href=(["'])(https?:\/\/[^"']+)\1/gi;
function extractLinks(html: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of html.matchAll(HREF_RE)) {
    const url = m[2];
    if (url.includes("{{unsubscribeUrl}}")) continue;
    if (/\/u\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+/i.test(url)) continue;
    if (!seen.has(url)) { seen.add(url); out.push(url); }
  }
  return out;
}

const html = `
  <a href="https://app.com/checkout/promo">Buy now</a>
  <a href='https://app.com/blog/details'>Learn more</a>
  <a href="https://app.com/checkout/promo">Buy now (dup)</a>
  <a href="https://app.com/u/contact123/abc456token">Unsubscribe</a>
  <a href="mailto:hi@x.com">Mail me</a>
  <a href="#section">Anchor</a>
`;
const urls = extractLinks(html);
check("extracts 2 distinct URLs",       urls.length === 2, urls);
check("preserves first-seen order",     urls[0] === "https://app.com/checkout/promo");
check("skips unsubscribe path",         !urls.some((u) => u.includes("/u/contact123")));
check("skips mailto",                   !urls.some((u) => u.startsWith("mailto:")));
check("skips anchor",                   !urls.some((u) => u.startsWith("#")));

// ─── 4. matchesFilter (logic-equivalent to automations.ts) ──────────────────
section("matchesFilter — workflowEmailId + linkUrl");

function matchesFilter(config: Record<string, unknown> | null, context: Record<string, unknown>): boolean {
  if (!config) return true;
  if (config.broadcastId     && context.broadcastId     !== config.broadcastId)     return false;
  if (config.workflowEmailId && context.workflowEmailId !== config.workflowEmailId) return false;
  if (config.linkUrl) {
    const ctxUrl = context.linkUrl;
    if (!ctxUrl) return false;
    if (!String(ctxUrl).includes(String(config.linkUrl))) return false;
  }
  return true;
}

check("broadcastId match",       matchesFilter({ broadcastId: "b1" }, { broadcastId: "b1" }) === true);
check("broadcastId mismatch",    matchesFilter({ broadcastId: "b1" }, { broadcastId: "b2" }) === false);
check("workflowEmailId match",   matchesFilter({ workflowEmailId: "we1" }, { workflowEmailId: "we1" }) === true);
check("workflowEmailId mismatch",matchesFilter({ workflowEmailId: "we1" }, { workflowEmailId: "we2" }) === false);
check(
  "linkUrl contains match (subset)",
  matchesFilter(
    { broadcastId: "b1", linkUrl: "/checkout" },
    { broadcastId: "b1", linkUrl: "https://app.com/checkout/promo?utm=x" },
  ) === true,
);
check(
  "linkUrl no match",
  matchesFilter(
    { broadcastId: "b1", linkUrl: "/checkout" },
    { broadcastId: "b1", linkUrl: "https://app.com/blog/article" },
  ) === false,
);
check(
  "linkUrl set, ctx has none",
  matchesFilter(
    { broadcastId: "b1", linkUrl: "/checkout" },
    { broadcastId: "b1" },
  ) === false,
);
check(
  "no linkUrl filter",
  matchesFilter(
    { broadcastId: "b1" },
    { broadcastId: "b1", linkUrl: "https://anywhere.com" },
  ) === true,
);

// ─── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${pass + fail} tests, ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
