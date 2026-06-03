// Workflow validation — shared between the client builder and the server
// status endpoint so both surfaces apply the same rules.
//
// Returns a list of `Issue` objects. Each issue carries:
//   - nodeId: which node it belongs to (null = trigger / graph-level)
//   - nodeLabel: human-readable node name for the UI
//   - messages: one or more reasons that node is invalid
//
// Two callers:
//   1. WorkflowBuilder — runs every render, shows red dots + powers the
//      pre-flight modal on Activate.
//   2. /api/workflows/[id]/status — runs on activation. If client somehow
//      submits an invalid graph (bug or bypass), server rejects with the
//      same `issues` shape so the client can render them too.

export type WorkflowNode = {
  id: string;
  type: string;
  config?: Record<string, unknown>;
};

export type WorkflowEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
};

export type WorkflowEmailMini = {
  id:        string;
  name?:     string | null;
  subject:   string;
  bodyHtml:  string;
  fromName:  string;
  fromEmail: string;
  senderId?: string | null;
};

export type WorkflowToValidate = {
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  startNodeId: string | null;
  emails?: WorkflowEmailMini[];
};

export type ValidationIssue = {
  nodeId:    string | null;    // null = trigger or workflow-level
  nodeLabel: string;           // shown in modal heading
  messages:  string[];         // one or more issues for this node
};

// ─── Entry ────────────────────────────────────────────────────────────────

export function validateWorkflow(wf: WorkflowToValidate): ValidationIssue[] {
  const out: ValidationIssue[] = [];

  const triggerMsgs = validateTrigger(wf.triggerType, wf.triggerConfig);
  if (triggerMsgs.length) {
    out.push({ nodeId: null, nodeLabel: "Trigger", messages: triggerMsgs });
  }

  const emailMap = new Map<string, WorkflowEmailMini>();
  for (const e of wf.emails ?? []) emailMap.set(e.id, e);

  for (const n of wf.nodes) {
    const msgs = validateNode(n.type, n.config ?? {});
    // SEND_EMAIL has an extra check: if config.emailId is set, the linked
    // WorkflowEmail's content must itself be complete (subject, body, sender).
    if (n.type === "SEND_EMAIL") {
      const emailId = (n.config?.emailId as string | undefined) ?? undefined;
      if (emailId) {
        const email = emailMap.get(emailId);
        if (!email) {
          msgs.push("Linked email no longer exists. Pick or create a new one.");
        } else {
          msgs.push(...validateWorkflowEmail(email));
        }
      }
    }
    if (msgs.length) out.push({ nodeId: n.id, nodeLabel: nodeLabel(n, emailMap), messages: msgs });
  }

  const graphMsgs = validateGraph(wf.nodes, wf.edges, wf.startNodeId);
  if (graphMsgs.length) {
    out.push({ nodeId: null, nodeLabel: "Workflow structure", messages: graphMsgs });
  }

  return out;
}

// Content check for a WorkflowEmail — used by validateWorkflow + can be
// called standalone (e.g., from a PATCH route's pre-flight).
export function validateWorkflowEmail(email: WorkflowEmailMini): string[] {
  const out: string[] = [];
  const senderOk = nonEmpty(email.senderId) || (nonEmpty(email.fromEmail) && nonEmpty(email.fromName));
  if (!senderOk)                  out.push("Email sender is not picked.");
  if (!nonEmpty(email.subject))   out.push("Email subject is empty.");
  if (isMailyDocEmpty(email.bodyHtml)) out.push("Email body is empty.");
  return out;
}

// A maily-rendered body is stored as a JSON-stringified TipTap doc (NOT raw
// HTML — the worker's renderEmailContent rejects anything that doesn't start
// with `{`). The visually-empty default doc is `{type:"doc", content:[{type:
// "paragraph"}]}` — non-empty as a string but renders to nothing. Walk the
// tree once looking for any `text` node with actual content.
function isMailyDocEmpty(raw: string | null | undefined): boolean {
  const s = (raw ?? "").trim();
  if (!s) return true;
  if (!s.startsWith("{")) {
    // Legacy plain HTML (pre-mly migration) — treat any non-empty string as
    // content so old data doesn't suddenly become "empty" mid-migration.
    return false;
  }
  let json: unknown;
  try { json = JSON.parse(s); } catch { return true; }
  const stack: unknown[] = [json];
  while (stack.length) {
    const n = stack.pop() as any;
    if (!n || typeof n !== "object") continue;
    if (typeof n.text === "string" && n.text.trim().length > 0) return false;
    // Image / button / spacer nodes count as content too — they render to
    // something the recipient sees.
    if (n.type === "image" || n.type === "button" || n.type === "logo") return false;
    if (Array.isArray(n.content)) for (const c of n.content) stack.push(c);
  }
  return true;
}

// ─── Per-node rules ────────────────────────────────────────────────────────

// Funnel-scoped triggers: events that carry funnelId + funnelStepId. The
// operator must pick BOTH — a workflow firing for "any checkout in the
// workspace" is almost never the real intent, and silently passing on a
// fresh template clone has burned users (e.g. Cart Abandonment fires for
// upsells in a different funnel they didn't intend to track). Force explicit
// scope; for the rare "all funnels" case, the operator can create one
// workflow per funnel.
const FUNNEL_SCOPED_TRIGGER_TYPES = new Set([
  "NEW_SALE", "SALE_CANCELED", "FORM_SUBMIT", "CHECKOUT_STARTED",
  "SUBSCRIPTION_PAYMENT_FAILED", "PAGE_VISITED",
]);

export function validateTrigger(type: string, config: Record<string, unknown>): string[] {
  const out: string[] = [];
  if (!type) { out.push("Pick a trigger type."); return out; }
  if (type === "TAG_ADDED" || type === "TAG_REMOVED") {
    if (!nonEmpty(config.tagId)) out.push("Pick which tag this trigger watches for.");
  }
  if (FUNNEL_SCOPED_TRIGGER_TYPES.has(type)) {
    if (!nonEmpty(config.funnelId))     out.push("Pick which funnel this trigger watches.");
    if (!nonEmpty(config.funnelStepId)) out.push("Pick which step in that funnel triggers the workflow.");
  }
  if (EMAIL_SCOPED_TRIGGER_TYPES.has(type)) {
    // Source discriminator: "broadcast" → broadcastId required;
    // "workflow_email" → workflowEmailId required. Without a source we'd
    // fire for every open/click in the workspace, flooding workflow runs.
    const source = config.source as string | undefined;
    if (!source) {
      out.push("Pick an email source (broadcast or workflow email).");
    } else if (source === "broadcast") {
      if (!nonEmpty(config.broadcastId)) out.push("Pick which broadcast this trigger watches for.");
    } else if (source === "workflow_email") {
      if (!nonEmpty(config.workflowEmailId)) out.push("Pick which workflow email this trigger watches for.");
    } else {
      out.push(`Email source "${source}" isn't supported.`);
    }
    // linkUrl is optional (omit = any link), but if set, must be non-empty
    // and a recognizable URL fragment. Stored as substring; runtime matcher
    // uses contains-match.
    if (type === "EMAIL_LINK_CLICKED" && config.linkUrl !== undefined) {
      const url = String(config.linkUrl).trim();
      if (!url) {
        out.push("Link filter is empty — clear it or pick a link.");
      } else if (!/^https?:\/\//i.test(url) && !url.includes("/")) {
        // Loose check: either a full http(s) URL or at least path-like.
        // Allows partial matches like "/welcome" or "checkout".
        out.push("Link filter must be a URL or URL substring (e.g. https://… or /path).");
      }
    }
  }
  return out;
}

// Node types this version of the system supports. Anything else (legacy
// SPLIT / GOAL from older workflows) gets a clear "deprecated" validation
// message + the canvas renders it as a deletable broken card.
const SUPPORTED_NODE_TYPES = new Set([
  "SEND_EMAIL", "ADD_TAG", "REMOVE_TAG", "WEBHOOK", "DELAY", "CONDITION", "END",
]);

// RFC 7230 §3.2.6 token charset for HTTP header names. Slightly stricter than
// what some servers accept but matches what fetch() will let through without
// throwing TypeError: invalid header name.
const HTTP_TOKEN_RE = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

// Triggers that scope to a specific email (broadcast OR workflow email).
// Without an explicit source they'd fire for every open/click in the
// workspace, which floods workflow runs. The operator picks the source
// type + the specific email; EMAIL_LINK_CLICKED also takes an optional
// linkUrl filter to narrow to a single CTA.
const EMAIL_SCOPED_TRIGGER_TYPES = new Set([
  "EMAIL_OPENED", "EMAIL_LINK_CLICKED",
]);

export function validateNode(type: string, config: Record<string, unknown>): string[] {
  const out: string[] = [];

  if (!SUPPORTED_NODE_TYPES.has(type)) {
    out.push(`Node type "${type}" is no longer supported. Delete this node and add a supported step in its place.`);
    return out;
  }

  switch (type) {
    case "SEND_EMAIL": {
      // Content lives in a linked WorkflowEmail row, validated separately
      // by validateWorkflowEmail() — the only node-level check is that the
      // operator actually picked / created one.
      if (!nonEmpty(config.emailId)) {
        out.push("Pick or create an email for this step.");
      }
      break;
    }

    case "ADD_TAG":
    case "REMOVE_TAG":
      if (!nonEmpty(config.tagId)) out.push("No tag selected.");
      break;

    case "WEBHOOK": {
      const url = String(config.url ?? "").trim();
      if (!url) out.push("URL is empty.");
      else if (!/^https?:\/\//i.test(url)) out.push("URL must start with http:// or https://.");
      const method = String(config.method ?? "POST").toUpperCase();
      if (!["GET", "POST", "PUT", "PATCH"].includes(method)) out.push("Method must be GET, POST, PUT, or PATCH.");
      // Optional headers — array of [key, value] tuples. Each row must have
      // a header-name-shaped key (RFC 7230 token charset) + a non-empty value.
      // Capped at 20 to keep the request reasonable and the UI scrollable.
      if (config.headers !== undefined) {
        if (!Array.isArray(config.headers)) {
          out.push("Headers must be a list of key / value rows.");
        } else {
          if (config.headers.length > 20) out.push("Too many headers (max 20).");
          for (let i = 0; i < config.headers.length; i++) {
            const row = config.headers[i] as unknown;
            if (!Array.isArray(row) || row.length !== 2) {
              out.push(`Header row ${i + 1} is malformed.`);
              continue;
            }
            const k = typeof row[0] === "string" ? row[0].trim() : "";
            const v = typeof row[1] === "string" ? row[1] : "";
            if (!k) out.push(`Header row ${i + 1}: name is empty.`);
            else if (!HTTP_TOKEN_RE.test(k)) out.push(`Header row ${i + 1}: "${k}" is not a valid header name.`);
            if (k && !v) out.push(`Header row ${i + 1}: "${k}" has no value.`);
          }
        }
      }
      break;
    }

    case "DELAY": {
      const d = Number(config.days    ?? 0);
      const h = Number(config.hours   ?? 0);
      const m = Number(config.minutes ?? 0);
      if (d < 0 || h < 0 || m < 0) out.push("Delay values cannot be negative.");
      if (d === 0 && h === 0 && m === 0) out.push("Set at least 1 minute, hour, or day.");
      const totalDays = d + h / 24 + m / 1440;
      if (totalDays > 365) out.push("Total delay can't exceed 365 days.");
      break;
    }

    case "CONDITION": {
      const kind = config.kind as string | undefined;
      if (!kind) { out.push("Condition kind not picked."); break; }
      if (kind === "contact_tag") {
        if (!nonEmpty(config.tagId)) out.push("Pick a tag to check.");
        const op = config.operator as string | undefined;
        if (op && op !== "has" && op !== "does_not_have") {
          out.push(`Tag operator "${op}" isn't supported.`);
        }
      } else if (kind === "contact_field") {
        if (!nonEmpty(config.field))    out.push("Pick a contact field.");
        if (!nonEmpty(config.operator)) out.push("Pick an operator.");
        const op = String(config.operator ?? "");
        const allowed = ["equals", "begins", "contains", "ends"];
        if (op && !allowed.includes(op)) {
          out.push(`Operator "${op}" isn't supported. Use one of: ${allowed.join(", ")}.`);
        }
        if (!nonEmpty(config.value)) {
          out.push("Set a value to compare against.");
        }
      } else if (kind === "contact_purchased") {
        // No required fields — falls back to trigger's funnelStepId when not
        // explicitly scoped. Documented for clarity.
      } else if (kind === "email_opened" || kind === "email_clicked") {
        // Source discriminator:
        //   "broadcast"      → broadcastId required.
        //   "workflow_email" → workflowEmailId required (any workflow's email).
        // (An earlier "any" option that matched any tracked send was removed
        //  — too easy to accidentally route on unrelated engagement.)
        const source = config.source as string | undefined;
        if (!source) {
          out.push("Pick an email source (broadcast or workflow email).");
        } else if (source === "broadcast") {
          if (!nonEmpty(config.broadcastId)) out.push("Pick which broadcast to check.");
        } else if (source === "workflow_email") {
          if (!nonEmpty(config.workflowEmailId)) out.push("Pick which workflow email to check.");
        } else {
          out.push(`Email source "${source}" isn't supported.`);
        }
      } else {
        // Unknown kind — `trigger_amount`, `trigger_funnel`, `always_true`,
        // `context_key`, and the old verbose names were dropped/renamed.
        // Anything else is stale data.
        out.push(`Condition kind "${kind}" isn't supported.`);
      }
      break;
    }

    case "END":
      break;
  }

  return out;
}

// ─── Graph-level rules ─────────────────────────────────────────────────────

export function validateGraph(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  startNodeId: string | null,
): string[] {
  const out: string[] = [];

  if (!startNodeId) {
    out.push("Connect the trigger to a starting step.");
    return out;
  }
  const nodeIds = new Set(nodes.map((n) => n.id));
  if (!nodeIds.has(startNodeId)) {
    out.push("Start node is missing from the graph.");
    return out;
  }
  for (const e of edges) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) {
      out.push(`Edge ${e.id} points to a missing node.`);
    }
  }

  // Per-node branch rules.
  const outBy = new Map<string, WorkflowEdge[]>();
  for (const e of edges) {
    const list = outBy.get(e.source) ?? [];
    list.push(e);
    outBy.set(e.source, list);
  }

  for (const n of nodes) {
    const outs = outBy.get(n.id) ?? [];
    // CONDITION fans out — needs BOTH true and false branches wired so the
    // executor can route either evaluation. Wire `true` to an End node when
    // you want early-exit-on-goal-met (replaces the old GOAL node pattern).
    if (n.type === "CONDITION") {
      const hasTrue  = outs.some((e) => e.label === "true");
      const hasFalse = outs.some((e) => e.label === "false");
      if (!hasTrue || !hasFalse) {
        out.push("If/else needs both a true and a false branch.");
      }
    }
    // Non-END, non-terminal node with no outgoing edge → dead end.
    if (n.type !== "END" && outs.length === 0) {
      out.push(`Step "${nodeLabel(n)}" has no next step. Add one or connect it to End.`);
    }
  }

  return out;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function nonEmpty(v: unknown): boolean {
  return v != null && String(v).trim().length > 0;
}

export function nodeLabel(n: WorkflowNode, emails?: Map<string, WorkflowEmailMini>): string {
  const cfg = n.config ?? {};
  switch (n.type) {
    case "SEND_EMAIL": {
      const emailId = cfg.emailId as string | undefined;
      const linked  = emailId ? emails?.get(emailId) : undefined;
      const subj    = String(linked?.subject ?? cfg.subject ?? "").trim();
      return subj ? `Send email — ${truncate(subj, 40)}` : "Send email";
    }
    case "ADD_TAG":    return "Add tag";
    case "REMOVE_TAG": return "Remove tag";
    case "WEBHOOK":    return "Webhook";
    case "DELAY":      return "Wait";
    case "CONDITION":  return "If / else";
    case "END":        return "End";
    default:           return n.type;
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
