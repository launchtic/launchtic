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

export type WorkflowToValidate = {
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  startNodeId: string | null;
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

  for (const n of wf.nodes) {
    const msgs = validateNode(n.type, n.config ?? {});
    if (msgs.length) out.push({ nodeId: n.id, nodeLabel: nodeLabel(n), messages: msgs });
  }

  const graphMsgs = validateGraph(wf.nodes, wf.edges, wf.startNodeId);
  if (graphMsgs.length) {
    out.push({ nodeId: null, nodeLabel: "Workflow structure", messages: graphMsgs });
  }

  return out;
}

// ─── Per-node rules ────────────────────────────────────────────────────────

// Funnel-scoped triggers: events that carry funnelId + funnelStepId. When the
// operator picks a funnel filter, they must also pick a specific step — a
// dangling "Course Premium / — any step —" filter is almost always an
// oversight rather than an intentional broad scope. (Operators who want
// "any funnel" can leave both fields blank.)
const FUNNEL_SCOPED_TRIGGER_TYPES = new Set([
  "NEW_SALE", "SALE_CANCELED", "FORM_SUBMIT", "CHECKOUT_STARTED",
]);

export function validateTrigger(type: string, config: Record<string, unknown>): string[] {
  const out: string[] = [];
  if (!type) { out.push("Pick a trigger type."); return out; }
  if (type === "TAG_ADDED" || type === "TAG_REMOVED") {
    if (!nonEmpty(config.tagId)) out.push("Pick which tag this trigger watches for.");
  }
  if (FUNNEL_SCOPED_TRIGGER_TYPES.has(type)) {
    if (nonEmpty(config.funnelId) && !nonEmpty(config.funnelStepId)) {
      out.push("Pick a specific step in this funnel, or remove the funnel filter to match all funnels.");
    }
  }
  if (BROADCAST_SCOPED_TRIGGER_TYPES.has(type)) {
    if (!nonEmpty(config.broadcastId)) {
      out.push("Pick which broadcast this trigger watches for (required).");
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

// Triggers that require a specific broadcast scope. Without it they'd fire
// for every open/click in the workspace, which floods workflow runs.
const BROADCAST_SCOPED_TRIGGER_TYPES = new Set([
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
      const senderOk = nonEmpty(config.senderId) || (nonEmpty(config.fromEmail) && nonEmpty(config.fromName));
      if (!senderOk) out.push("Sender is not picked.");
      if (!nonEmpty(config.subject))  out.push("Subject is empty.");
      if (!nonEmpty(config.bodyHtml)) out.push("Email body is empty.");
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
        if (!nonEmpty(config.broadcastId)) {
          out.push("Pick which broadcast to check for opens/clicks.");
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

export function nodeLabel(n: WorkflowNode): string {
  const cfg = n.config ?? {};
  switch (n.type) {
    case "SEND_EMAIL": {
      const subj = String(cfg.subject ?? "").trim();
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
