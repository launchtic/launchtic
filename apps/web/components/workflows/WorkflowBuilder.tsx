"use client";

// Visual workflow builder — react-flow canvas + node palette + properties panel.
// Auto-saves debounced; explicit Activate transitions DRAFT→ACTIVE via the
// status endpoint (which validates the graph server-side too).
//
// Pattern 1 layout: the Trigger is rendered as a special first canvas node
// (locked, non-deletable). The edge FROM the trigger node to any action node
// determines `startNodeId` — there is no separate "set as start" UI. Trigger
// type + funnel/step filter are edited via the properties panel when the
// trigger node is selected. The trigger node and its outgoing edge are virtual
// at the persistence layer: filtered out on save, re-injected on load.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ReactFlow, Background, Controls, MiniMap, ReactFlowProvider,
  useNodesState, useEdgesState, addEdge, Handle, Position, useStore,
  type Edge, type Node, type Connection, MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";
import {
  ArrowLeft, Plus, Play, Pause, Mail, Tag, TagIcon as TagOff, Globe, Clock,
  GitBranch, Square, Loader2, Save, History, Zap, X, ChevronDown,
  Trash2, ShoppingCart, ShoppingBag, CreditCard, Send, Undo2, MailOpen,
  MousePointerClick, Eye, User,
} from "lucide-react";
import { useToast } from "../ui/Toast";
import { apiFetch } from "../../lib/api-client";
import WorkflowRunHistory from "./WorkflowRunHistory";
import {
  validateWorkflow,
  type ValidationIssue,
} from "../../lib/workflow-validation";

// ─── Types ──────────────────────────────────────────────────────────────────

type NodeType =
  | "SEND_EMAIL" | "ADD_TAG" | "REMOVE_TAG" | "WEBHOOK"
  | "DELAY" | "CONDITION" | "END";
type Status = "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";

type WorkflowNode = {
  id: string;
  type: NodeType;
  position?: { x: number; y: number };
  config?: Record<string, unknown>;
};
type WorkflowEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
  weight?: number;
};

type Workflow = {
  id: string;
  name: string;
  description: string | null;
  status: Status;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  startNodeId: string | null;
  maxDurationDays: number | null;
};

type WorkflowEmailMini = {
  id:        string;
  name:      string | null;
  subject:   string;
  bodyHtml:  string;
  fromName:  string;
  fromEmail: string;
  senderId:  string | null;
  sentCount:    number;
  openedCount:  number;
  clickedCount: number;
};

// Cross-workflow email metadata shown in the trigger source="workflow_email"
// picker. Body is NOT included — the link-filter picker fetches bodyHtml on
// demand via /api/workflows/[id]/email-links to keep the editor load light.
type WorkspaceEmailMini = {
  id:           string;
  name:         string | null;
  subject:      string;
  workflowId:   string;
  workflowName: string;
};

type Props = {
  workflow: Workflow;
  tags:     { id: string; name: string; color: string | null }[];
  senders:  { id: string; name: string; email: string; isDefault: boolean }[];
  funnels:  { id: string; name: string; steps: { id: string; name: string; type: string }[] }[];
  broadcasts: { id: string; name: string; subject: string; status: string; sentAt: Date | null }[];
  workflowEmails:  WorkflowEmailMini[];
  workspaceEmails: WorkspaceEmailMini[];
};

// Reserved IDs for the virtual trigger node + its outgoing edge. Filtered out
// when persisting `nodes` and `edges` JSON to the database.
const TRIGGER_ID = "__trigger";
const TRIGGER_EDGE_ID = "__trigger_edge";

// ─── Auto-layout (dagre) ────────────────────────────────────────────────────
// Every structural change to the graph (add/delete/connect) re-runs dagre to
// keep the diagram clean. User cannot drag nodes manually — keeps the canvas
// consistent across sessions and devices, matching Klaviyo / Mailchimp / etc.
// Node sizes are approximate; dagre uses them to size lanes/gaps. Tweak NODE_*
// to taste.

// Node widths must match the rendered card so dagre allocates correct lane
// space — otherwise siblings overlap when subtitle text is long. Cards
// truncate subtitle to keep width fixed (see maxWidth/ellipsis in NodeCard).
// Trigger card and step cards share the same width so dagre's center-align
// produces a perfectly vertical edge between them. Trigger gets a slightly
// taller card (extra row for trigger subtitle) but the width matches.
const NODE_W         = 220;
const NODE_H         = 76;
const TRIGGER_W      = 220;
const TRIGGER_H      = 80;
// Vertical gap between layers — 50px is enough room for the arrow head and
// optional true/false label without making the canvas feel sparse. Smaller
// than competitors (Klaviyo ~80, HubSpot ~70) but works well at our node size.
const LAYOUT_RANKSEP = 50;
const LAYOUT_NODESEP = 120;

// Gap between the trigger card bottom and the first-step card top. Smaller
// than the regular ranksep so the trigger reads as a "header" attached to the
// flow rather than a separate floating node.
const TRIGGER_FIRST_GAP = 40;

function autoLayout(nodes: Node[], edges: Edge[]): Node[] {
  if (nodes.length === 0) return nodes;
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: "TB",
    ranksep: LAYOUT_RANKSEP,
    nodesep: LAYOUT_NODESEP,
    marginx: 40,
    marginy: 40,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of nodes) {
    const isTrigger = n.id === TRIGGER_ID;
    g.setNode(n.id, {
      width:  isTrigger ? TRIGGER_W : NODE_W,
      height: isTrigger ? TRIGGER_H : NODE_H,
    });
  }
  for (const e of edges) g.setEdge(e.source, e.target);

  dagre.layout(g);

  const laid = nodes.map((n) => {
    const p = g.node(n.id);
    if (!p) return n;
    return { ...n, position: { x: p.x - p.width / 2, y: p.y - p.height / 2 } };
  });

  // Post-process trigger: snap it directly above the first step so the start
  // edge is (a) perfectly vertical — fixing the horizontal-offset wobble from
  // dagre's lane assignment when trigger.width ≠ node.width — and (b) short,
  // matching the "header attached to flow" look of Klaviyo / Mailchimp.
  const triggerNode  = laid.find((n) => n.id === TRIGGER_ID);
  const startEdge    = edges.find((e) => e.source === TRIGGER_ID);
  const firstStepNode = startEdge ? laid.find((n) => n.id === startEdge.target) : undefined;
  if (triggerNode && firstStepNode) {
    // Center-align X: triggerLeft = firstStepCenterX - TRIGGER_W/2
    triggerNode.position.x = firstStepNode.position.x + (NODE_W - TRIGGER_W) / 2;
    triggerNode.position.y = firstStepNode.position.y - TRIGGER_H - TRIGGER_FIRST_GAP;
  }

  return laid;
}

// Structural key: changes only when the graph topology shifts (add/delete a
// node, add/delete/redirect an edge). Stable across position drift, data
// updates, and node selection — so the layout effect doesn't loop.
function structuralKey(nodes: Node[], edges: Edge[]): string {
  const ns = nodes.map((n) => n.id).sort().join(",");
  const es = edges.map((e) => `${e.source}>${e.target}`).sort().join("|");
  return `${ns};${es}`;
}

// Context lets the custom node components reach into the builder's state
// without us threading callbacks through node.data (which would force the
// autosave hash to recompute every render).
const BuilderContext = createContext<{
  openPicker: (sourceNodeId: string) => void;
  deleteNode: (nodeId: string) => void;
  // Per-node issue list — empty means valid. Used by NodeCard to render the
  // small red badge in the top-left and tooltip the messages on hover.
  issuesByNode: Map<string, string[]>;
  // True when the workflow is ACTIVE (Klaviyo-style strict lock). Nodes
  // read this to hide their delete X and the "+" add-next affordance.
  isLocked: boolean;
} | null>(null);

function useBuilder() {
  const ctx = useContext(BuilderContext);
  if (!ctx) throw new Error("Custom workflow node/edge rendered outside BuilderContext");
  return ctx;
}

// ─── Node metadata ──────────────────────────────────────────────────────────

const NODE_DEFS: Record<NodeType, { label: string; Icon: typeof Mail; color: string; defaultConfig: Record<string, unknown> }> = {
  SEND_EMAIL: { label: "Send email",    Icon: Mail,        color: "#3b82f6", defaultConfig: { subject: "", bodyHtml: "" } },
  ADD_TAG:    { label: "Add tag",       Icon: Tag,         color: "#10b981", defaultConfig: { tagId: "" } },
  REMOVE_TAG: { label: "Remove tag",    Icon: TagOff,      color: "#f59e0b", defaultConfig: { tagId: "" } },
  WEBHOOK:    { label: "Webhook",       Icon: Globe,       color: "#8b5cf6", defaultConfig: { url: "", method: "POST" } },
  DELAY:      { label: "Wait",          Icon: Clock,       color: "#6b7280", defaultConfig: { hours: 1 } },
  CONDITION:  { label: "If / else",     Icon: GitBranch,   color: "#f97316", defaultConfig: { kind: "contact_tag" } },
  END:        { label: "End",           Icon: Square,      color: "#dc2626", defaultConfig: {} },
};

const TRIGGER_TYPES = [
  "NEW_SALE", "SALE_CANCELED", "SUBSCRIPTION_PAYMENT_FAILED",
  "FORM_SUBMIT", "TAG_ADDED", "TAG_REMOVED",
  "EMAIL_OPENED", "EMAIL_LINK_CLICKED",
  "CHECKOUT_STARTED", "PAGE_VISITED",
];

// Triggers that scope to a specific email (broadcast OR workflow email).
// The operator picks the source type then the specific email; for
// EMAIL_LINK_CLICKED they can additionally narrow to a single link.
const EMAIL_SCOPED_TRIGGERS = new Set(["EMAIL_OPENED", "EMAIL_LINK_CLICKED"]);

// Triggers whose underlying events carry a funnel + step reference, so the
// "scope to funnel X / step Y" filter is meaningful. Tag changes,
// subscription billing events, and email clicks aren't funnel-scoped — they
// hide the funnel dropdown to avoid confusing the operator.
const FUNNEL_SCOPED_TRIGGERS = new Set([
  "NEW_SALE", "SALE_CANCELED", "FORM_SUBMIT", "CHECKOUT_STARTED",
  "SUBSCRIPTION_PAYMENT_FAILED", "PAGE_VISITED",
]);

// Which step types can fire each trigger. Used to filter the Step picker so
// the operator only sees steps that actually emit the chosen trigger event
// (e.g. NEW_SALE only fires from CHECKOUT/UPSELL/DOWNSELL steps).
//
// Separation of concerns:
//   • Pages WITHOUT payment → FORM_SUBMIT (lead capture / opt-in forms).
//     OPTIN, CUSTOM, THANKYOU. The form may sit on a thank-you page (e.g.
//     post-purchase survey) — still a form, still belongs here.
//   • Pages WITH payment → NEW_SALE / SALE_CANCELED / CHECKOUT_STARTED /
//     SUBSCRIPTION_PAYMENT_FAILED. Those triggers fire on the payment
//     event, not on the form embedded in the page, so the operator should
//     pick the matching purchase trigger instead of FORM_SUBMIT.
const STEP_TYPES_PER_TRIGGER: Record<string, string[]> = {
  NEW_SALE:                    ["CHECKOUT", "UPSELL", "DOWNSELL"],
  SALE_CANCELED:               ["CHECKOUT", "UPSELL", "DOWNSELL"],
  FORM_SUBMIT:                 ["OPTIN", "SALES", "CUSTOM", "THANKYOU"],
  CHECKOUT_STARTED:            ["CHECKOUT"],
  // Subscriptions are only created from steps that process recurring
  // payment — typically CHECKOUT, occasionally UPSELL/DOWNSELL with a
  // recurring price plan.
  SUBSCRIPTION_PAYMENT_FAILED: ["CHECKOUT", "UPSELL", "DOWNSELL"],
  // PAGE_VISITED fires on any tracked page load — every step type is a
  // valid target (operator scopes to a specific funnel + step in the
  // dropdown). Identity comes from a cookie set when the contact clicks an
  // email link; anonymous visitors don't trigger PAGE_VISITED.
  PAGE_VISITED:                ["OPTIN", "SALES", "CHECKOUT", "UPSELL", "DOWNSELL", "THANKYOU", "CUSTOM"],
};

// One-line plain-English description shown under the trigger dropdown so the
// operator knows exactly when the workflow will start firing.
const TRIGGER_DESCRIPTIONS: Record<string, string> = {
    NEW_SALE:                    "When a contact completes a paid order",
    SALE_CANCELED:               "When an order is refunded or canceled",
    SUBSCRIPTION_PAYMENT_FAILED: "When a recurring subscription charge fails",
    FORM_SUBMIT:                 "When a contact submits a funnel opt-in form",
    CHECKOUT_STARTED:            "When a visitor enters checkout with their email",
    TAG_ADDED:                   "When a tag is assigned to a contact",
    TAG_REMOVED:                 "When a tag is removed from a contact",
    EMAIL_OPENED:                "When a contact opens a tracked email",
    EMAIL_LINK_CLICKED:          "When a contact clicks a link in a tracked email",
    PAGE_VISITED:                "When a known contact visits a funnel page",
};

function triggerHumanLabel(t: string): string {
  return t.replace(/_/g, " ").toLowerCase();
}

// Icon per trigger type for the rich dropdown. Falls back to Zap for legacy
// values so the picker never renders an icon-less row. Kept next to
// TRIGGER_DESCRIPTIONS so a new trigger only requires touching this file in
// two spots (label/desc + icon).
const TRIGGER_ICONS: Record<string, typeof Mail> = {
  NEW_SALE:                    ShoppingCart,
  SALE_CANCELED:               Undo2,
  SUBSCRIPTION_PAYMENT_FAILED: CreditCard,
  FORM_SUBMIT:                 Send,
  TAG_ADDED:                   Tag,
  TAG_REMOVED:                 TagOff,
  EMAIL_OPENED:                MailOpen,
  EMAIL_LINK_CLICKED:          MousePointerClick,
  CHECKOUT_STARTED:            ShoppingBag,
  PAGE_VISITED:                Eye,
};

// One-line description per node type — shared by the "+ add step" picker
// (AddNodePicker grid) AND the Step type switcher in the NodeConfigModal
// header. Hoisted to module scope so both surfaces stay in sync; updating
// the copy once propagates to both.
const NODE_TYPE_DESCRIPTIONS: Record<NodeType, string> = {
  SEND_EMAIL: "Personalised email with Mustache vars",
  ADD_TAG:    "Tag the contact",
  REMOVE_TAG: "Remove a tag from the contact",
  WEBHOOK:    "Call any HTTP endpoint (Slack, CRM, custom)",
  DELAY:      "Wait minutes / hours / days before next step",
  CONDITION:  "Branch true / false (wire true → End for early exit)",
  END:        "Mark this branch completed",
};

// CONDITION node "Kind" options for the rich dropdown. Without descriptions
// it's hard to tell "Contact purchased" from "Email opened" at first glance —
// the inline description tells the operator what each kind evaluates so they
// pick correctly. Order is stable across re-renders (constant array).
const CONDITION_KIND_OPTIONS: Array<{
  value: string; label: string; description: string; Icon: typeof Mail;
}> = [
  {
    value:       "contact_tag",
    label:       "Contact tag",
    description: "True if the contact has (or doesn't have) a specific tag.",
    Icon:        Tag,
  },
  {
    value:       "contact_field",
    label:       "Contact field",
    description: "Compare a profile field (email, firstName, country…) against a value.",
    Icon:        User,
  },
  {
    value:       "contact_purchased",
    label:       "Contact purchased",
    description: "True if the contact placed a PAID order after this run started.",
    Icon:        ShoppingCart,
  },
  {
    value:       "email_opened",
    label:       "Email opened",
    description: "True if the contact opened a specific broadcast or workflow email.",
    Icon:        MailOpen,
  },
  {
    value:       "email_clicked",
    label:       "Email clicked",
    description: "True if the contact clicked a link in a specific email.",
    Icon:        MousePointerClick,
  },
];

// ─── Custom node renderers ──────────────────────────────────────────────────

const handleStyle = { width: 8, height: 8, background: "#94a3b8", border: "1.5px solid white" } as const;

// Inline "+" button rendered below the node card. Click opens the action
// picker modal anchored at this source node. Visible only when this node
// can accept a new outgoing edge (END never; linear types only when
// no outgoing edge yet; CONDITION/GOAL/SPLIT always — they fan out).
function NextStepButton({ onClick, accent }: { onClick: () => void; accent?: string }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title="Add next step"
      style={{
        position: "absolute",
        bottom: -34,
        left: "50%",
        transform: "translateX(-50%)",
        width: 24,
        height: 24,
        borderRadius: 999,
        border: `1.5px dashed ${accent ?? "#cbd5e1"}`,
        background: "white",
        color: accent ?? "#64748b",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        zIndex: 10,
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      }}
      className="hover:!border-solid hover:!scale-110 transition-transform"
    >
      <Plus size={12} />
    </button>
  );
}

// `canAddNext` is computed by each node from the live edges store — so the
// "+" appears/disappears reactively without needing the parent to push flags
// into node.data on every edges update.
//
// Rules per node type:
//   • TRIGGER       → 1 outgoing edge
//   • END           → terminal, never adds
//   • CONDITION     → 2 outgoing (true / false branches)
//   • everything    → 1 outgoing (linear chain)
function useCanAddNext(nodeId: string, nodeType: NodeType | "TRIGGER"): boolean {
  return useStore((s) => {
    const outgoingCount = s.edges.reduce((n, e) => e.source === nodeId ? n + 1 : n, 0);
    if (nodeType === "TRIGGER")  return outgoingCount < 1;
    if (nodeType === "END")      return false;
    if (nodeType === "CONDITION") return outgoingCount < 2;
    return outgoingCount < 1;
  });
}

function NodeCard({ data, id }: { data: { type: NodeType; label?: string; subtitle?: string }; id: string }) {
  const { openPicker, deleteNode, issuesByNode, isLocked } = useBuilder();
  const def = NODE_DEFS[data.type];

  // Legacy / deprecated node type (e.g. SPLIT, GOAL from older workflows).
  // Render a clearly broken card so the operator can delete + replace it
  // instead of crashing the editor.
  if (!def) {
    return (
      <div
        className="group/node"
        style={{
          background: "#fef2f2",
          borderRadius: 10,
          border: "1.5px dashed #ef4444",
          padding: "10px 12px",
          width: 220,
          position: "relative",
          color: "#7f1d1d",
        }}
      >
        <Handle type="target" position={Position.Top} style={handleStyle} />
        {!isLocked && (
          <button
            onClick={(e) => { e.stopPropagation(); deleteNode(id); }}
            title="Delete this deprecated node"
            style={{
              position: "absolute", top: -8, right: -8,
              width: 20, height: 20, borderRadius: 999,
              border: "1.5px solid white", background: "#ef4444", color: "white",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", zIndex: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
            }}
          >
            <Trash2 size={10} />
          </button>
        )}
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
          Deprecated
        </div>
        <div style={{ fontSize: 12, marginTop: 2 }}>
          Type "{data.type}" no longer supported — delete and replace.
        </div>
        <Handle type="source" position={Position.Bottom} style={handleStyle} />
      </div>
    );
  }

  const Icon = def.Icon;
  const canAddNext = useCanAddNext(id, data.type);
  const myIssues = issuesByNode.get(id) ?? [];
  const isInvalid = myIssues.length > 0;
  return (
    <div
      className="group/node"
      style={{
        background: "white",
        borderRadius: 10,
        border: "1.5px solid #e5e7eb",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        padding: "10px 12px",
        // Fixed width so the rendered size matches dagre's NODE_W hint. If we
        // let cards auto-size to content, long email subjects make siblings
        // overflow into each other.
        width: 220,
        position: "relative",
      }}
    >
      <Handle type="target" position={Position.Top} style={handleStyle} />
      {/* Validation badge — top-left, always visible when invalid. Hover for
          a tooltip with the issue list. Click also opens the properties panel
          (via the natural onNodeClick) so user can fix immediately. */}
      {isInvalid && (
        <div
          title={myIssues.join("\n")}
          style={{
            position: "absolute",
            top: -6,
            left: -6,
            width: 18,
            height: 18,
            borderRadius: 999,
            background: "#ef4444",
            color: "white",
            border: "2px solid white",
            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 700,
            zIndex: 11,
            pointerEvents: "auto",
            cursor: "help",
          }}
        >
          !
        </div>
      )}
      {/* Hover-revealed delete button. Stopping propagation so the click
          doesn't also fire react-flow's onNodeClick. Hidden when the
          workflow is ACTIVE (Klaviyo lock). */}
      {!isLocked && (
        <button
          onClick={(e) => { e.stopPropagation(); deleteNode(id); }}
          title="Delete node"
          className="opacity-0 group-hover/node:opacity-100 transition-opacity"
          style={{
            position: "absolute",
            top: -8,
            right: -8,
            width: 20,
            height: 20,
            borderRadius: 999,
            border: "1.5px solid white",
            background: "#ef4444",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            zIndex: 10,
            boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
          }}
        >
          <Trash2 size={10} />
        </button>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: data.subtitle ? 2 : 0 }}>
        <div style={{ width: 22, height: 22, borderRadius: 6, background: `${def.color}15`, display: "flex", alignItems: "center", justifyContent: "center", color: def.color, flexShrink: 0 }}>
          <Icon size={13} />
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{data.label ?? def.label}</div>
      </div>
      {data.subtitle && (
        <div
          style={{
            fontSize: 11,
            color: "#6b7280",
            marginLeft: 30,
            // Single-line truncation keeps card height fixed. Hover title
            // reveals the full string.
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={data.subtitle}
        >
          {data.subtitle}
        </div>
      )}
      {data.type !== "END" && <Handle type="source" position={Position.Bottom} style={handleStyle} />}
      {canAddNext && !isLocked && <NextStepButton onClick={() => openPicker(id)} />}
    </div>
  );
}

function TriggerNodeCard({ data, id }: { data: { triggerType: string; triggerSubtitle: string | null }; id: string }) {
  const { openPicker, issuesByNode, isLocked } = useBuilder();
  const canAddNext = useCanAddNext(id, "TRIGGER");
  // Trigger-level issues are keyed by the reserved "__trigger" id in the
  // issuesByNode map (see InnerBuilder's issue-mapping useMemo).
  const myIssues = issuesByNode.get(TRIGGER_ID) ?? [];
  const isInvalid = myIssues.length > 0;
  return (
    <div
      style={{
        background: "linear-gradient(180deg, #eff6ff 0%, #dbeafe 100%)",
        borderRadius: 10,
        border: "1.5px solid #2563eb",
        boxShadow: "0 2px 8px rgba(37, 99, 235, 0.15)",
        padding: "10px 12px",
        // Fixed width matching NODE_W and dagre's TRIGGER_W so the trigger
        // center sits exactly above the first-step center → straight edge.
        width: 220,
        position: "relative",
      }}
    >
      {isInvalid && (
        <div
          title={myIssues.join("\n")}
          style={{
            position: "absolute",
            top: -6,
            left: -6,
            width: 18,
            height: 18,
            borderRadius: 999,
            background: "#ef4444",
            color: "white",
            border: "2px solid white",
            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 700,
            zIndex: 11,
            cursor: "help",
          }}
        >
          !
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
        <div style={{ width: 22, height: 22, borderRadius: 6, background: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", color: "white", flexShrink: 0 }}>
          <Zap size={13} fill="white" />
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#1e3a8a", letterSpacing: 0.6, textTransform: "uppercase" }}>Trigger</div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#1e3a8a", marginLeft: 30 }}>
        {triggerHumanLabel(data.triggerType)}
      </div>
      {data.triggerSubtitle && (
        <div
          style={{
            fontSize: 11,
            color: "#3730a3",
            marginLeft: 30,
            marginTop: 1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={data.triggerSubtitle}
        >
          {data.triggerSubtitle}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ ...handleStyle, background: "#2563eb" }} />
      {canAddNext && !isLocked && <NextStepButton onClick={() => openPicker(id)} accent="#2563eb" />}
    </div>
  );
}

const nodeTypes = { workflowNode: NodeCard, triggerNode: TriggerNodeCard };

// ─── Main component ────────────────────────────────────────────────────────

export default function WorkflowBuilder(props: Props) {
  return (
    <ReactFlowProvider>
      <InnerBuilder {...props} />
    </ReactFlowProvider>
  );
}

function InnerBuilder({ workflow: initial, tags, funnels, broadcasts, workflowEmails: initialEmails, workspaceEmails }: Props) {
  const router  = useRouter();
  const params  = useParams();
  const slug    = params.workspaceSlug as string;
  const toast   = useToast();

  const [name, setName]           = useState(initial.name);
  const [status, setStatus]       = useState<Status>(initial.status);
  // Klaviyo-style strict lock: an ACTIVE workflow is immutable from the
  // builder. Threading isLocked through to: canvas affordances (delete /
  // "+" / drag), node-config modal (form inputs + type switcher + delete),
  // top-bar Save (hidden), name input (readonly). Server PATCH also rejects
  // with 409 as a defense in depth.
  const isLocked = status === "ACTIVE";
  const [triggerType, setTriggerType]     = useState<string>(initial.triggerType);
  const [triggerConfig, setTriggerConfig] = useState<Record<string, unknown>>(initial.triggerConfig);
  const [showHistory, setShowHistory] = useState(false);

  // The full canonical config map keyed by node id — keeps node.config out
  // of the react-flow internal state (rf re-renders on every drag).
  const [configMap, setConfigMap] = useState<Record<string, Record<string, unknown>>>(() => {
    const m: Record<string, Record<string, unknown>> = {};
    for (const n of initial.nodes) m[n.id] = { ...(n.config ?? {}) };
    return m;
  });

  // Helpers to build the trigger virtual node + edge.
  const triggerSubtitle = useMemo(() => describeTriggerScope(triggerConfig, funnels), [triggerConfig, funnels]);

  // Build initial nodes + edges and run dagre once so first paint is laid out
  // (no {0,0} flash before the layout effect catches up).
  const initialEdges: Edge[] = useMemo(() => [
    ...(initial.startNodeId
      ? [styleTriggerEdge({
          id: TRIGGER_EDGE_ID, source: TRIGGER_ID, target: initial.startNodeId,
        })]
      : []),
    ...initial.edges.map((e) => edgeToRf(e)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], []);

  const initialNodes: Node[] = useMemo(() => {
    const raw: Node[] = [
      {
        id: TRIGGER_ID,
        type: "triggerNode",
        position: { x: 0, y: 0 },
        deletable: false,
        data: { triggerType: initial.triggerType, triggerSubtitle: describeTriggerScope(initial.triggerConfig, funnels) },
      },
      ...initial.nodes.map((n) => ({
        id: n.id,
        type: "workflowNode",
        position: { x: 0, y: 0 },
        data: {
          type: n.type,
          // initialEmails (prop) here — workflowEmails state isn't declared
          // yet at this point in the function. Subsequent renders pick up
          // the state via the patchConfig path.
          subtitle: nodeSubtitle(n.type, n.config ?? {}, tags, funnels, broadcasts, initialEmails),
        },
      } as Node)),
    ];
    return autoLayout(raw, initialEdges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node>(initialNodes);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [busy, setBusy] = useState<"saving" | "activating" | null>(null);
  // Action picker modal — opened by either a node's "+" button (append) or an
  // edge's "+" button (insert between source and target). Null when closed.
  // Action picker modal — opened by clicking the "+" button under any node.
  // Holds the source node id; null when closed.
  const [pickerSourceId, setPickerSourceId] = useState<string | null>(null);
  const openPicker = useCallback((sourceId: string) => setPickerSourceId(sourceId), []);

  // Type-switch confirm modal — set when user picks a new type for a node
  // whose current config has non-default content, so they confirm the
  // discard before we wipe.
  const [switchTarget, setSwitchTarget] = useState<{
    nodeId:      string;
    currentType: NodeType;
    newType:     NodeType;
  } | null>(null);

  // ─── Workflow emails state ──────────────────────────────────────────────
  // SEND_EMAIL nodes reference WorkflowEmail rows by id. Edits are routed to
  // a per-email PATCH endpoint (debounced) instead of the workflow JSON, so
  // long bodies don't trigger workflow-graph re-saves on every keystroke.
  const [workflowEmails, setWorkflowEmails] = useState<WorkflowEmailMini[]>(initialEmails);
  const emailSaveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const updateWorkflowEmail = useCallback((emailId: string, patch: Partial<WorkflowEmailMini>) => {
    setWorkflowEmails((prev) => prev.map((e) => e.id === emailId ? { ...e, ...patch } : e));
    const existing = emailSaveTimers.current.get(emailId);
    if (existing) clearTimeout(existing);
    emailSaveTimers.current.set(emailId, setTimeout(async () => {
      emailSaveTimers.current.delete(emailId);
      await apiFetch(`/api/workflows/${initial.id}/emails/${emailId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }).catch(() => {});
    }, 800));
  }, [initial.id]);

  // Reflect trigger type / scope changes into the trigger node's visible data.
  useEffect(() => {
    setRfNodes((prev) => prev.map((n) => n.id === TRIGGER_ID
      ? { ...n, data: { ...n.data, triggerType, triggerSubtitle } }
      : n));
  }, [triggerType, triggerSubtitle, setRfNodes]);

  // Auto-layout: any structural change (node added/removed, edge added/redirected)
  // re-runs dagre to recompute positions. Position-only updates (none here, since
  // drag is disabled) don't trigger this — `structuralKey` ignores position.
  const layoutKey = useMemo(() => structuralKey(rfNodes, rfEdges), [rfNodes, rfEdges]);
  useEffect(() => {
    setRfNodes((prev) => autoLayout(prev, rfEdges));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey]);

  // Note: `canAddNext` used to be computed here and pushed into node.data.
  // It's now read reactively by each node via useStore() — see useCanAddNext()
  // in NodeCard / TriggerNodeCard.

  // startNodeId is derived from the edge originating at the trigger node.
  // Persisted on save; never stored in component state to avoid divergence
  // between "the edge user sees" and "the value sent to the server".
  const derivedStartNodeId = useMemo(
    () => rfEdges.find((e) => e.source === TRIGGER_ID)?.target ?? null,
    [rfEdges],
  );

  // ─── Auto-save (debounced) ──────────────────────────────────────────────
  // Captures the same shape save() PATCHes — so react-flow internals
  // (selection, measured dims, hover state) don't trigger spurious autosaves
  // even though they re-create the rfNodes array each tick. Only edits to
  // PERSISTED fields (name, triggerConfig, startNodeId, node configs/types/
  // positions, edges) make the snap string change.
  //
  // Skipped while the workflow is ACTIVE: server's Klaviyo lock returns 409
  // and the Save button is hidden anyway. Pause re-enables autosave.
  //
  // First render seeds lastSavedSnap from the initial layout react-flow just
  // computed on mount — that's not an operator edit, so we don't fire a
  // PATCH for it.
  const persistedSnap = useMemo(
    () => JSON.stringify({
      name,
      triggerConfig,
      startNodeId: derivedStartNodeId,
      nodes: rfNodes
        .filter((n) => n.id !== TRIGGER_ID)
        .map((n) => ({
          id:       n.id,
          type:     (n.data as any).type as NodeType,
          position: n.position,
          config:   configMap[n.id] ?? {},
        })),
      edges: rfEdges
        .filter((e) => e.source !== TRIGGER_ID && e.target !== TRIGGER_ID)
        .map((e) => ({
          id: e.id, source: e.source, target: e.target,
          label:  e.label as string | undefined,
          weight: (e.data as any)?.weight as number | undefined,
        })),
    }),
    [name, triggerConfig, derivedStartNodeId, rfNodes, rfEdges, configMap],
  );

  const lastSavedSnap = useRef<string | null>(null);
  useEffect(() => {
    if (isLocked) return;
    if (lastSavedSnap.current === null) {
      lastSavedSnap.current = persistedSnap;
      return;
    }
    if (persistedSnap === lastSavedSnap.current) return;

    const t = setTimeout(async () => {
      lastSavedSnap.current = persistedSnap;
      await save();
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLocked, persistedSnap]);

  // ─── Persistence ────────────────────────────────────────────────────────
  // Both the manual Save button and the autosave effect above call this.
  // Builds the payload from current state — autosave's persistedSnap mirrors
  // this exactly so the change-detection stays accurate.
  async function save() {
    setBusy("saving");
    const payload = {
      name,
      triggerConfig,
      startNodeId: derivedStartNodeId,
      nodes: rfNodes
        .filter((n) => n.id !== TRIGGER_ID) // virtual — don't persist
        .map((n) => ({
          id: n.id,
          type: (n.data as any).type as NodeType,
          position: n.position,
          config: configMap[n.id] ?? {},
        })),
      edges: rfEdges
        .filter((e) => e.source !== TRIGGER_ID && e.target !== TRIGGER_ID) // virtual — don't persist
        .map((e) => ({
          id: e.id, source: e.source, target: e.target,
          label: e.label as string | undefined,
          weight: (e.data as any)?.weight as number | undefined,
        })),
    };
    const res  = await apiFetch(`/api/workflows/${initial.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(null);
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      toast.error(json?.error ?? "Save failed");
    }
  }

  async function activate() {
    const goingActive = status !== "ACTIVE";

    // Client-side pre-flight: if there's anything broken, open the modal
    // instead of round-tripping to the server. Pause → Active still
    // validates; Active → Pause skips validation (always allowed).
    if (goingActive && issues.length > 0) {
      // Ensure the latest debounced save lands before activation, so the
      // server validates the same graph the user sees.
      await save();
      setActivationIssues(issues);
      return;
    }

    setBusy("activating");
    const res = await apiFetch(`/api/workflows/${initial.id}/status`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: goingActive ? "ACTIVE" : "PAUSED" }),
    });
    const json = await res.json();
    setBusy(null);
    if (!json.success) {
      // Server may return an issues[] array (same shape as validateWorkflow)
      // when validation failed there too — re-render the modal with those.
      if (Array.isArray(json.issues) && json.issues.length) {
        setActivationIssues(json.issues as ValidationIssue[]);
      } else {
        toast.error(json.error ?? "Activation failed");
      }
      return;
    }
    setStatus(json.data.status);
  }

  // ─── Graph mutations ────────────────────────────────────────────────────
  // Append a new node as the next step from `sourceId`. The new node is
  // placed visually below the source; an edge is wired from source → new.
  // For the trigger node, the edge is the styled "start" edge and replaces
  // any existing one (only one outgoing edge from trigger is permitted).
  // For CONDITION/GOAL, the second outgoing edge gets the auto-derived
  // true/false label.
  async function addNodeFrom(sourceId: string, type: NodeType) {
    const id  = `n_${Math.random().toString(36).slice(2, 10)}`;
    const def = NODE_DEFS[type];
    const newCfg: Record<string, unknown> = { ...def.defaultConfig };

    // SEND_EMAIL no longer auto-creates a WorkflowEmail at add time. The
    // node lands with no emailId set; the modal's picker prompts the
    // operator to either pick an existing email or hit "Create new email"
    // (which navigates to the fullscreen editor). Avoids littering the
    // workflow with empty placeholder emails the operator may not want.

    const sourceNode = rfNodes.find((n) => n.id === sourceId);
    // Position is a placeholder — the structural-change effect below will
    // re-run dagre and reposition every node within the same tick.
    const position = { x: 0, y: 0 };

    setConfigMap((prev) => ({ ...prev, [id]: newCfg }));
    setRfNodes((prev) => prev.concat({
      id, type: "workflowNode", position,
      data: { type, subtitle: nodeSubtitle(type, newCfg, tags, funnels, broadcasts, workflowEmails) },
    }));

    if (sourceId === TRIGGER_ID) {
      setRfEdges((prev) => prev
        .filter((e) => e.source !== TRIGGER_ID)
        .concat(styleTriggerEdge({ id: TRIGGER_EDGE_ID, source: TRIGGER_ID, target: id })));
    } else {
      const sourceType = (sourceNode?.data as any)?.type as NodeType | undefined;
      // Only CONDITION needs true/false labels. GOAL exits on true (no edge)
      // and falls through to the single outgoing edge on false (no label).
      let label: string | undefined;
      if (sourceType === "CONDITION") {
        const has = rfEdges.filter((e) => e.source === sourceId);
        label = has.some((e) => e.label === "true") ? "false" : "true";
      }
      const edgeId = `e_${Math.random().toString(36).slice(2, 10)}`;
      setRfEdges((prev) => prev.concat(buildNormalEdge(edgeId, sourceId, id, label)));
    }

    setSelectedNodeId(id);
    setPickerSourceId(null);
  }

  // Refs mirroring rfNodes + rfEdges + configMap so deleteNode + cascade
  // helpers keep stable callback identity (passed via BuilderContext to
  // NodeCards — a changing ref would force every card to re-render).
  const rfNodesRef   = useRef<Node[]>(rfNodes);
  const rfEdgesRef   = useRef<Edge[]>(rfEdges);
  const configMapRef = useRef(configMap);
  useEffect(() => { rfNodesRef.current   = rfNodes;   }, [rfNodes]);
  useEffect(() => { rfEdgesRef.current   = rfEdges;   }, [rfEdges]);
  useEffect(() => { configMapRef.current = configMap; }, [configMap]);

  // Delete-confirm state. The hover X and keyboard Delete both route through
  // this — we open the modal first and only perform the destructive action
  // after the operator confirms.
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Open the confirm modal for a node delete. Called from the hover X via
  // BuilderContext.
  const deleteNode = useCallback((nodeId: string) => {
    if (nodeId === TRIGGER_ID) return;
    setDeleteConfirmId(nodeId);
  }, []);

  // Perform the actual delete after confirm. Cascade behaviour: this node
  // + every node reachable downstream (via outgoing edges) is removed in one
  // go. Avoids leaving orphan subtrees that float disconnected from the
  // trigger — operator picked Option B (cascade) so this matches the
  // confirm-dialog message they accepted.
  //
  // SEND_EMAIL nodes in the cascade set get their linked WorkflowEmail row
  // deleted alongside.
  const performDeleteNode = useCallback((nodeId: string) => {
    if (nodeId === TRIGGER_ID) return;

    const downstream = getDownstreamNodeIds(nodeId, rfEdgesRef.current);
    const toDelete   = new Set<string>([nodeId, ...downstream]);

    // Clean up any WorkflowEmail rows owned by SEND_EMAIL nodes in the set.
    // We deliberately DON'T delete the linked WorkflowEmail when a
    // SEND_EMAIL node is removed. Emails are first-class entities now —
    // multiple nodes may reference the same email, and the operator may
    // want to keep authored content even if they restructure the graph.
    // Stale emails can be cleaned up from a future email management page.

    setRfNodes((prev) => prev.filter((n) => !toDelete.has(n.id)));
    setRfEdges((prev) => prev.filter((e) => !toDelete.has(e.source) && !toDelete.has(e.target)));
    setConfigMap((prev) => {
      const next = { ...prev };
      for (const id of toDelete) delete next[id];
      return next;
    });
    setSelectedNodeId((sel) => sel && toDelete.has(sel) ? null : sel);
    setDeleteConfirmId(null);
  }, [setRfNodes, setRfEdges]);

  function deleteSelected() {
    if (selectedNodeId) deleteNode(selectedNodeId);
  }

  // Discard helper for the delete confirm modal. Computes the cascade set —
  // this node + every downstream node — so the operator sees exactly what's
  // about to disappear (truncated to the first 5 with a "+N more" tail).
  function nodeDeleteSummary(nodeId: string): {
    label:             string;
    lostItems:         string[];
    downstreamCount:   number;
    downstreamLabels:  string[];
    downstreamMore:    number;
  } | null {
    const node = rfNodes.find((n) => n.id === nodeId);
    if (!node) return null;
    const type = (node.data as any).type as NodeType | undefined;
    if (!type) return null;
    const cfg = configMap[nodeId] ?? {};
    const lostItems = getDiscardSummary(type, cfg, workflowEmails);

    const downstream = getDownstreamNodeIds(nodeId, rfEdges);
    const downstreamLabels = [...downstream]
      .slice(0, 5)
      .map((id) => {
        const n = rfNodes.find((nn) => nn.id === id);
        const t = (n?.data as any)?.type as NodeType | undefined;
        return t && NODE_DEFS[t] ? NODE_DEFS[t].label : "Unknown step";
      });
    const downstreamMore = Math.max(0, downstream.size - downstreamLabels.length);

    return {
      label:            NODE_DEFS[type].label,
      lostItems,
      downstreamCount:  downstream.size,
      downstreamLabels,
      downstreamMore,
    };
  }

  // ─── Switch node type ────────────────────────────────────────────────────
  // Resets config to the new type's defaults and cleans up CONDITION's
  // fan-out edge labels when switching away. The node id + position + edges
  // to/from it are preserved — operator doesn't lose their graph topology
  // when fixing a wrong type pick.
  //
  // SEND_EMAIL never auto-creates or auto-deletes a WorkflowEmail across
  // type switches — emails are first-class entities the operator owns
  // separately. Switching FROM SEND_EMAIL leaves the email untouched (may
  // be reused by another node or kept as a draft).
  const switchNodeType = useCallback(async (nodeId: string, newType: NodeType) => {
    const node = rfNodesRef.current.find((n) => n.id === nodeId);
    if (!node) return;
    const currentType = (node.data as any).type as NodeType | undefined;
    if (!currentType || currentType === newType) return;

    if (currentType === "CONDITION") {
      // CONDITION fans out via labeled true/false edges. Other types are
      // linear → drop the extras so the new node has at most one outgoing
      // edge.
      setRfEdges((prev) => {
        const outs = prev.filter((e) => e.source === nodeId);
        if (outs.length <= 1) return prev;
        const keep = outs[0];
        return prev.filter((e) => e.source !== nodeId || e.id === keep.id);
      });
    }

    // Build new config — type defaults only. SEND_EMAIL deliberately starts
    // with no emailId; the operator picks or creates one via the modal.
    const newConfig: Record<string, unknown> = { ...NODE_DEFS[newType].defaultConfig };

    setConfigMap((prev) => ({ ...prev, [nodeId]: newConfig }));
    setRfNodes((prev) => prev.map((n) => n.id === nodeId ? {
      ...n,
      data: {
        ...n.data,
        type:     newType,
        subtitle: nodeSubtitle(newType, newConfig, tags, funnels, broadcasts, workflowEmails),
      },
    } : n));
    setSwitchTarget(null);
  }, [
    tags, funnels, broadcasts, workflowEmails, setRfNodes, setRfEdges,
  ]);

  // Decide whether to swap silently or open the confirm modal.
  function handleTypeSwitch(nodeId: string, newType: NodeType) {
    const node = rfNodes.find((n) => n.id === nodeId);
    if (!node) return;
    const currentType = (node.data as any).type as NodeType | undefined;
    if (!currentType || currentType === newType) return;
    const currentConfig = configMap[nodeId] ?? {};
    if (hasNodeContent(currentType, currentConfig, workflowEmails)) {
      setSwitchTarget({ nodeId, currentType, newType });
    } else {
      void switchNodeType(nodeId, newType);
    }
  }

  // Block deletion of the trigger node via keyboard / programmatic changes.
  const onNodesChangeGuarded = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      // Trigger node can't be removed; ACTIVE workflows ignore removes too
      // (Klaviyo lock) — including keyboard Delete/Backspace.
      const safe = changes.filter((c) => {
        if (c.type === "remove" && c.id === TRIGGER_ID) return false;
        if (c.type === "remove" && isLocked) return false;
        return true;
      });
      onNodesChange(safe);
    },
    [onNodesChange, isLocked],
  );

  // ─── Live validation ────────────────────────────────────────────────────
  // Runs on every render so the red badges + pre-flight modal stay in sync.
  // Same rules as the server's status endpoint (shared lib).
  const issues = useMemo(() => validateWorkflow({
    triggerType,
    triggerConfig,
    startNodeId: derivedStartNodeId,
    nodes: rfNodes
      .filter((n) => n.id !== TRIGGER_ID)
      .map((n) => ({
        id:     n.id,
        type:   (n.data as any).type as string,
        config: configMap[n.id] ?? {},
      })),
    edges: rfEdges
      .filter((e) => e.source !== TRIGGER_ID && e.target !== TRIGGER_ID)
      .map((e) => ({ id: e.id, source: e.source, target: e.target, label: e.label as string | undefined })),
    emails: workflowEmails,
  }), [triggerType, triggerConfig, derivedStartNodeId, rfNodes, rfEdges, configMap, workflowEmails]);

  // Mapped per-node for the NodeCard badge. Trigger-level + graph-level
  // issues (nodeId === null) live under the reserved TRIGGER_ID key so the
  // trigger card surfaces them visually.
  const issuesByNode = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const i of issues) {
      const key = i.nodeId ?? TRIGGER_ID;
      const existing = m.get(key) ?? [];
      m.set(key, [...existing, ...i.messages]);
    }
    return m;
  }, [issues]);

  // Pre-flight modal state. Opened by Activate click when issues exist;
  // server-returned issues also populate this (defense in depth).
  const [activationIssues, setActivationIssues] = useState<ValidationIssue[] | null>(null);

  // Builder context value — provided AFTER deleteNode is in scope. Stable
  // reference so custom node/edge components don't re-render on every change.
  const builderCtxValue = useMemo(
    () => ({ openPicker, deleteNode, issuesByNode, isLocked }),
    [openPicker, deleteNode, issuesByNode, isLocked],
  );


  const onConnect = useCallback(
    (conn: Connection) => {
      const sourceNode = rfNodes.find((n) => n.id === conn.source);
      const sourceType = (sourceNode?.data as any)?.type as NodeType | undefined;

      // Trigger → action edge: only one allowed. Replace any existing edge
      // from the trigger so reconnecting to a new start is a single drag.
      if (conn.source === TRIGGER_ID) {
        setRfEdges((prev) => {
          const without = prev.filter((e) => e.source !== TRIGGER_ID);
          return without.concat(styleTriggerEdge({
            id: TRIGGER_EDGE_ID, source: TRIGGER_ID, target: conn.target!,
          }));
        });
        return;
      }

      // CONDITION fans out via labeled true/false edges so the executor can
      // route either evaluation. GOAL terminates on true (no edge needed) and
      // takes the single outgoing edge on false — no label.
      let label: string | undefined;
      if (sourceType === "CONDITION") {
        const existing = rfEdges.filter((e) => e.source === conn.source);
        label = existing.some((e) => e.label === "true") ? "false" : "true";
      }
      const id = `e_${Math.random().toString(36).slice(2, 10)}`;
      setRfEdges((prev) => addEdge(buildNormalEdge(id, conn.source!, conn.target!, label) as Edge, prev));
    },
    [rfNodes, rfEdges, setRfEdges],
  );

  // ─── Selected node config ───────────────────────────────────────────────
  const selectedNode  = useMemo(() => rfNodes.find((n) => n.id === selectedNodeId), [rfNodes, selectedNodeId]);
  const selectedType  = (selectedNode?.data as any)?.type as NodeType | undefined;
  const selectedConfig = selectedNodeId && selectedNodeId !== TRIGGER_ID ? (configMap[selectedNodeId] ?? {}) : {};

  function patchConfig(patch: Record<string, unknown>) {
    if (!selectedNodeId || selectedNodeId === TRIGGER_ID) return;
    setConfigMap((prev) => {
      const next = { ...prev, [selectedNodeId]: { ...(prev[selectedNodeId] ?? {}), ...patch } };
      // Update the subtitle in node data so the canvas reflects changes.
      setRfNodes((nodes) => nodes.map((n) => n.id === selectedNodeId ? {
        ...n,
        data: { ...n.data, subtitle: nodeSubtitle(selectedType!, next[selectedNodeId], tags, funnels, broadcasts, workflowEmails) },
      } : n));
      return next;
    });
  }

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <BuilderContext.Provider value={builderCtxValue}>
    <div className="flex flex-col h-[calc(100vh-56px)] bg-gray-50">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 bg-white shrink-0">
        <button
          onClick={() => router.push(`/${slug}/workflows`)}
          className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
        >
          <ArrowLeft size={16} />
        </button>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          readOnly={isLocked}
          className={`flex-1 text-sm font-semibold text-gray-900 bg-transparent border-none outline-none rounded px-2 py-1 -ml-1 ${
            isLocked ? "cursor-not-allowed" : "focus:ring-2 focus:ring-blue-500"
          }`}
        />
        <span className={`text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded ${
          status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" :
          status === "PAUSED" ? "bg-amber-50 text-amber-700" :
          "bg-gray-100 text-gray-600"
        }`}>{status.toLowerCase()}</span>
        {busy === "saving" && <span className="text-xs text-gray-400 flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> saving…</span>}
        <button
          onClick={() => setShowHistory(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
        >
          <History size={13} /> Runs
        </button>
        {/* Save hidden when locked — the server PATCH would 409 anyway, and
            the button reading "Save" on a read-only canvas is misleading. */}
        {!isLocked && (
          <button
            onClick={() => save()}
            disabled={!!busy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 rounded-lg disabled:opacity-50"
          >
            {busy === "saving" ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            Save
          </button>
        )}
        <button
          onClick={activate}
          disabled={!!busy}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-50 ${
            status === "ACTIVE" ? "text-amber-700 bg-amber-50 hover:bg-amber-100" : "text-white bg-emerald-600 hover:bg-emerald-700"
          }`}
        >
          {busy === "activating" ? <Loader2 size={12} className="animate-spin" /> : (status === "ACTIVE" ? <Pause size={12} /> : <Play size={12} />)}
          {status === "ACTIVE" ? "Pause" : "Activate"}
          {status !== "ACTIVE" && issues.length > 0 && (
            <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-white/25 text-[10px] font-bold">
              {issues.length}
            </span>
          )}
        </button>
      </div>

      {/* Live-workflow lock banner. Klaviyo-style: an ACTIVE workflow is
          immutable from this canvas. Pause to edit. Click Pause is a
          one-step affordance via the top-bar Activate button (which reads
          "Pause" when ACTIVE). */}
      {isLocked && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 flex items-center gap-2 shrink-0">
          <Pause size={13} className="text-amber-600 shrink-0" />
          <p className="text-[12px] text-amber-800 flex-1">
            Workflow is active — edits are locked. Click <strong>Pause</strong> to make changes.
          </p>
          <button
            onClick={activate}
            disabled={!!busy}
            className="text-[11px] font-semibold text-amber-700 hover:text-amber-900 hover:underline disabled:opacity-50"
          >
            Pause workflow
          </button>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Canvas */}
        <div className="flex-1 relative bg-[#fafafa]">
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            onNodesChange={onNodesChangeGuarded}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            nodesDraggable={false}
            onNodeClick={(_, n) => setSelectedNodeId(n.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            fitView
            proOptions={{ hideAttribution: true }}
            deleteKeyCode={["Backspace", "Delete"]}
          >
            <Background gap={16} size={1} color="#e5e7eb" />
            <Controls showInteractive={false} />
            <MiniMap nodeStrokeWidth={2} pannable zoomable />
          </ReactFlow>
        </div>

      </div>

      {/* Centered config modal — replaces the old right-side properties panel.
          Opens whenever a node (trigger or action) is selected, and also fires
          automatically after the operator picks a type from the "+" picker
          (addNodeFrom calls setSelectedNodeId on the freshly-created node).
          Three shapes: trigger / supported action / deprecated legacy.
          Save flow unchanged — config writes are still debounced into the
          workflow autosave; closing the modal does NOT need an explicit save. */}
      {selectedNode && (
        <NodeConfigModal
          isTrigger={selectedNodeId === TRIGGER_ID}
          selectedNodeId={selectedNodeId!}
          selectedType={selectedType}
          selectedConfig={selectedConfig}
          onClose={() => setSelectedNodeId(null)}
          // Trigger form deps
          triggerType={triggerType}
          triggerConfig={triggerConfig}
          onTriggerTypeChange={setTriggerType}
          onTriggerConfigChange={setTriggerConfig}
          // Action form deps
          onTypeSwitch={(t) => handleTypeSwitch(selectedNodeId!, t)}
          onConfigChange={patchConfig}
          onDelete={deleteSelected}
          tags={tags}
          funnels={funnels}
          broadcasts={broadcasts}
          workspaceEmails={workspaceEmails}
          workflowEmails={workflowEmails}
          workflowId={initial.id}
          workspaceSlug={slug}
          isLocked={isLocked}
        />
      )}

      {showHistory && (
        <WorkflowRunHistory workflowId={initial.id} onClose={() => setShowHistory(false)} />
      )}

      {pickerSourceId && (
        <AddNodePicker
          sourceId={pickerSourceId}
          onPick={(type) => addNodeFrom(pickerSourceId, type)}
          onClose={() => setPickerSourceId(null)}
        />
      )}

      {activationIssues && (
        <ValidationIssuesModal
          issues={activationIssues}
          onJumpToNode={(nodeId) => {
            // null means trigger or workflow-level — select trigger.
            setSelectedNodeId(nodeId ?? TRIGGER_ID);
            setActivationIssues(null);
          }}
          onClose={() => setActivationIssues(null)}
        />
      )}

      {deleteConfirmId && (() => {
        const summary = nodeDeleteSummary(deleteConfirmId);
        if (!summary) {
          // Stale id — close modal silently.
          setTimeout(() => setDeleteConfirmId(null), 0);
          return null;
        }
        return (
          <div
            onClick={() => setDeleteConfirmId(null)}
            className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
            >
              <div className="px-5 py-3 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-900">Delete this step?</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Removing &ldquo;{summary.label}&rdquo;:
                </p>
              </div>
              <div className="px-5 py-3 space-y-1.5">
                {summary.lostItems.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-gray-700">
                    <span className="text-red-500 mt-0.5">•</span>
                    <span>{s}</span>
                  </div>
                ))}
                {summary.downstreamCount > 0 && (
                  <div className="flex items-start gap-2 text-xs text-gray-700">
                    <span className="text-red-500 mt-0.5">•</span>
                    <div className="flex-1">
                      <div>
                        {summary.downstreamCount} downstream {summary.downstreamCount === 1 ? "step" : "steps"} will also be deleted:
                      </div>
                      <ul className="mt-1 ml-2 space-y-0.5">
                        {summary.downstreamLabels.map((label, i) => (
                          <li key={i} className="text-gray-600">– {label}</li>
                        ))}
                        {summary.downstreamMore > 0 && (
                          <li className="text-gray-500">+ {summary.downstreamMore} more</li>
                        )}
                      </ul>
                    </div>
                  </div>
                )}
                <p className="text-[11px] text-gray-400 leading-snug mt-3 pt-2 border-t border-gray-100">
                  This can&apos;t be undone.
                </p>
              </div>
              <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={() => performDeleteNode(deleteConfirmId)}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {switchTarget && (() => {
        const curr = configMap[switchTarget.nodeId] ?? {};
        const summary = getDiscardSummary(switchTarget.currentType, curr, workflowEmails);
        return (
          <div
            onClick={() => setSwitchTarget(null)}
            className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
            >
              <div className="px-5 py-3 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-900">Change action type?</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Switching from {NODE_DEFS[switchTarget.currentType].label} to{" "}
                  {NODE_DEFS[switchTarget.newType].label} will discard:
                </p>
              </div>
              <div className="px-5 py-3 space-y-1.5">
                {summary.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-gray-700">
                    <span className="text-red-500 mt-0.5">•</span>
                    <span>{s}</span>
                  </div>
                ))}
                <p className="text-[11px] text-gray-400 leading-snug mt-3 pt-2 border-t border-gray-100">
                  Edges to/from this step are kept. The node id and position don&apos;t change.
                </p>
              </div>
              <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
                <button
                  onClick={() => setSwitchTarget(null)}
                  className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void switchNodeType(switchTarget.nodeId, switchTarget.newType)}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg"
                >
                  Switch to {NODE_DEFS[switchTarget.newType].label}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
    </BuilderContext.Provider>
  );
}

// ─── Action picker modal ───────────────────────────────────────────────────
// Triggered by the "+" button under any node. Shows a grid of available node
// types with icon + label + one-line hint. Picking one closes the modal and
// inserts that node below the source with edges auto-wired.

function AddNodePicker({
  sourceId, onPick, onClose,
}: {
  sourceId: string;
  onPick: (type: NodeType) => void;
  onClose: () => void;
}) {
  // Hide END after the trigger — `trigger → end` with nothing between is
  // never a useful workflow. Allow everywhere else.
  const hideEnd = sourceId === TRIGGER_ID;
  const types = (Object.keys(NODE_DEFS) as NodeType[]).filter((t) => !(hideEnd && t === "END"));

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Add a step</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
            <X size={14} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1.5 p-3">
          {types.map((t) => {
            const def = NODE_DEFS[t];
            const Icon = def.Icon;
            return (
              <button
                key={t}
                onClick={() => onPick(t)}
                className="flex items-start gap-3 p-3 text-left rounded-lg hover:bg-gray-50 transition-colors group"
              >
                <div
                  style={{ background: `${def.color}15`, color: def.color }}
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform"
                >
                  <Icon size={16} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-900">{def.label}</div>
                  <div className="text-[11px] text-gray-500 leading-snug">{NODE_TYPE_DESCRIPTIONS[t]}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Centered config modal ─────────────────────────────────────────────────
//
// Replaces the right-side properties panel — same three shapes (trigger,
// supported action, deprecated legacy) but mounted as a centered overlay so
// the canvas underneath stays visible at full width when nothing is
// selected. Backdrop click / ESC / Done button all close (just clears
// selectedNodeId — config writes are debounced into the workflow autosave so
// no explicit save is needed).

function NodeConfigModal({
  isTrigger, selectedNodeId, selectedType, selectedConfig,
  onClose, onTypeSwitch, onConfigChange, onDelete,
  triggerType, triggerConfig, onTriggerTypeChange, onTriggerConfigChange,
  tags, funnels, broadcasts, workspaceEmails, workflowEmails,
  workflowId, workspaceSlug, isLocked,
}: {
  isTrigger:        boolean;
  selectedNodeId:   string;
  selectedType:     NodeType | undefined;
  selectedConfig:   Record<string, unknown>;
  onClose:          () => void;
  onTypeSwitch:     (t: NodeType) => void;
  onConfigChange:   (patch: Record<string, unknown>) => void;
  onDelete:         () => void;
  triggerType:      string;
  triggerConfig:    Record<string, unknown>;
  onTriggerTypeChange:   (t: string) => void;
  onTriggerConfigChange: (c: Record<string, unknown>) => void;
  tags:             Props["tags"];
  funnels:          Props["funnels"];
  broadcasts:       Props["broadcasts"];
  workspaceEmails:  WorkspaceEmailMini[];
  workflowEmails:   WorkflowEmailMini[];
  workflowId:       string;
  workspaceSlug:    string;
  /** True when the parent workflow is ACTIVE; renders the modal read-only. */
  isLocked:         boolean;
}) {
  // ESC closes the modal — matches the AddNodePicker + ValidationIssuesModal
  // behavior so all overlays share one mental model.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Decide which body to render. Three branches mirror the old sidebar's
  // three rendering paths exactly.
  const isSupportedAction = !isTrigger && selectedType !== undefined && !!NODE_DEFS[selectedType];
  const isDeprecated      = !isTrigger && selectedType !== undefined && !NODE_DEFS[selectedType];

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        // One size for every node-config shape (trigger / action / deprecated)
        // so the canvas doesn't flicker between layouts as the operator clicks
        // around. Sized for the trigger's rich "When" picker (max-w-2xl gives
        // its 2-line descriptions room to breathe; min-h-[520px] lets the
        // ~288px open panel expand in place instead of forcing body scroll).
        // Smaller forms (ADD_TAG, REMOVE_TAG, deprecated) end up with empty
        // space below — acceptable trade for consistency, and WEBHOOK's
        // payload preview + SEND_EMAIL's picker block fill it well anyway.
        className="bg-white rounded-2xl w-full max-w-2xl min-h-[520px] max-h-[85vh] shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Header — three shapes. For supported actions, the type switcher
            is rendered as an explicit labeled select with chevron + border so
            the operator can see it's a dropdown (the earlier borderless inline
            select read as plain text). Trigger and deprecated headers stay
            text-only since they don't have a switchable type at this layer
            (trigger type changes via the "When" select inside the body). */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50">
          {isTrigger && (
            <>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-blue-100">
                <Zap size={16} className="text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase font-semibold tracking-wider text-gray-500">Trigger</div>
                <h2 className="text-sm font-semibold text-gray-900 truncate">Edit trigger</h2>
              </div>
            </>
          )}
          {isSupportedAction && selectedType && (
            <>
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: `${NODE_DEFS[selectedType].color}1f` }}
              >
                {(() => {
                  const I = NODE_DEFS[selectedType].Icon;
                  return <I size={16} style={{ color: NODE_DEFS[selectedType].color }} />;
                })()}
              </div>
              <div className="flex-1 min-w-0">
                <label className="text-[10px] uppercase font-semibold tracking-wider text-gray-500 block mb-0.5">
                  Step type
                </label>
                {/* hideButtonIcon: the outer 8x8 type-colored icon box already
                    signals the current type, so the closed dropdown stays
                    text-only. Open panel still shows each option's icon to
                    aid scanning. */}
                <RichSelect
                  value={selectedType}
                  onChange={(v) => onTypeSwitch(v as NodeType)}
                  disabled={isLocked}
                  hideButtonIcon
                  options={(Object.keys(NODE_DEFS) as NodeType[]).map((t) => ({
                    value:       t,
                    label:       NODE_DEFS[t].label,
                    description: NODE_TYPE_DESCRIPTIONS[t] ?? "",
                    Icon:        NODE_DEFS[t].Icon,
                  }))}
                />
              </div>
            </>
          )}
          {isDeprecated && (
            <>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-red-100">
                <Trash2 size={14} className="text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase font-semibold tracking-wider text-red-500">Legacy</div>
                <h2 className="text-sm font-semibold text-red-700 truncate">Deprecated node</h2>
              </div>
            </>
          )}
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:bg-gray-200 rounded shrink-0"
            title="Close (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body — scrolls if the form exceeds the modal max-height. When
            isLocked, the wrapping fieldset disables every nested form
            control (inputs, selects, textareas, button submits) in one
            shot. Anchor <a> tags don't honor fieldset disabled, so we gate
            them inline (Create-new buttons hidden, navigation links still
            available so the operator can read the linked content). */}
        <fieldset disabled={isLocked} className="contents">
          {/* flex-1 lets the body fill the modal vertically — paired with the
              trigger modal's min-h above, the dropdown panel always has room
              to expand in place instead of pushing the modal into scroll. */}
          <div className="p-4 overflow-y-auto flex-1">
            {isTrigger && (
              <TriggerConfigForm
                triggerType={triggerType}
                triggerConfig={triggerConfig}
                funnels={funnels}
                tags={tags}
                broadcasts={broadcasts}
                workspaceEmails={workspaceEmails}
                workflowId={workflowId}
                onTypeChange={onTriggerTypeChange}
                onConfigChange={onTriggerConfigChange}
              />
            )}
            {isSupportedAction && selectedType && (
              <NodeConfigForm
                type={selectedType}
                config={selectedConfig}
                onChange={onConfigChange}
                tags={tags}
                funnels={funnels}
                broadcasts={broadcasts}
                workflowEmails={workflowEmails}
                workspaceSlug={workspaceSlug}
                workflowId={workflowId}
                workflowTriggerType={triggerType}
                isLocked={isLocked}
              />
            )}
            {isDeprecated && selectedType && (
              <div className="space-y-3">
                <p className="text-xs text-gray-600">
                  Type <code className="bg-gray-100 px-1 py-0.5 rounded">{selectedType}</code> is no
                  longer supported. Delete this node and replace with a supported step.
                </p>
                {!isLocked && (
                  <button
                    onClick={onDelete}
                    className="w-full px-3 py-1.5 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg"
                  >
                    Delete this node
                  </button>
                )}
              </div>
            )}
          </div>
        </fieldset>

        {/* Footer — single Done button. Autosave already wrote the changes
            so closing the modal is the same as "save & close". */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-100 bg-gray-50">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-gray-900 hover:bg-gray-800 rounded-lg"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
  // Acknowledge `selectedNodeId` for completeness — surfacing it in the
  // signature keeps the parent's contract obvious even though the modal
  // itself doesn't render the id.
  void selectedNodeId;
}

// ─── Pre-flight validation modal ───────────────────────────────────────────
// Shown when Activate is clicked but the workflow has issues. Lists every
// invalid node with its messages; "Fix this" jumps to that node so the
// properties panel opens with the right form. Also re-rendered if the server
// returns issues (defense-in-depth — client and server share the validator).

function ValidationIssuesModal({
  issues, onJumpToNode, onClose,
}: {
  issues: ValidationIssue[];
  onJumpToNode: (nodeId: string | null) => void;
  onClose: () => void;
}) {
  const total = issues.reduce((n, i) => n + i.messages.length, 0);
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden shadow-2xl"
      >
        <div className="px-5 py-3 border-b border-gray-100 flex items-start justify-between gap-3 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Almost there — {total} thing{total === 1 ? "" : "s"} to fix</h2>
            <p className="text-xs text-gray-500 mt-0.5">Resolve these before activating the workflow.</p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:bg-gray-100 rounded shrink-0">
            <X size={14} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {issues.map((iss, idx) => (
            <div key={idx} className="border border-gray-200 rounded-lg p-3">
              <div className="flex items-start justify-between gap-3 mb-1.5">
                <h3 className="text-sm font-semibold text-gray-900 truncate">{iss.nodeLabel}</h3>
                <button
                  onClick={() => onJumpToNode(iss.nodeId)}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline shrink-0"
                >
                  Fix this →
                </button>
              </div>
              <ul className="space-y-0.5">
                {iss.messages.map((m, i) => (
                  <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                    <span className="text-red-500 mt-0.5">•</span>
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-end gap-2 shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 rounded-lg"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Rich select (icon + label + description) ──────────────────────────────
//
// Generic dropdown that replaces a plain <select> when each option needs an
// explanation. Used for the trigger "When" picker and CONDITION "Kind" —
// any place where the label alone doesn't tell the operator what they're
// picking. Closed state matches the chrome of our other form inputs so it
// drops in without layout jitter. Click outside or ESC closes. Keyboard
// arrow nav is intentionally skipped — option lists are short (~5–10) and
// the original <select> didn't support arrow nav meaningfully either.
function RichSelect({
  value, onChange, options, disabled, hideButtonIcon,
}: {
  value:    string;
  onChange: (v: string) => void;
  options:  Array<{ value: string; label: string; description: string; Icon: typeof Mail }>;
  disabled?: boolean;
  /** Skip the icon inside the closed-state button. Useful when the caller
      already renders the current selection's icon outside the dropdown
      (e.g. the NodeConfigModal header shows a type-colored icon box next
      to the Step type switcher). */
  hideButtonIcon?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      // Cast via HTMLElement to dodge the react-flow `Node` type imported at
      // the top of this file shadowing the DOM Node interface in scope.
      if (ref.current && !ref.current.contains(e.target as HTMLElement)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`w-full flex items-center gap-2 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-left focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          disabled ? "cursor-not-allowed text-gray-400" : "hover:border-gray-300"
        }`}
      >
        {current && !hideButtonIcon && <current.Icon size={14} className="text-gray-500 shrink-0" />}
        <span className="flex-1 truncate">
          {current?.label ?? "— pick a trigger —"}
        </span>
        <ChevronDown
          size={14}
          className={`text-gray-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div
          className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-72 overflow-auto py-1"
          role="listbox"
        >
          {options.map((o) => {
            const isSelected = o.value === value;
            return (
              <button
                type="button"
                key={o.value}
                onClick={() => { onChange(o.value); setOpen(false); }}
                role="option"
                aria-selected={isSelected}
                className={`w-full flex items-start gap-2.5 px-2.5 py-2 text-left transition-colors ${
                  isSelected ? "bg-blue-50" : "hover:bg-gray-50"
                }`}
              >
                <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
                  isSelected ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
                }`}>
                  <o.Icon size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-xs font-medium ${isSelected ? "text-blue-900" : "text-gray-900"}`}>
                    {o.label}
                  </div>
                  <div className="text-[11px] text-gray-500 leading-snug mt-0.5">
                    {o.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Trigger config form (right panel when trigger node selected) ──────────

function TriggerConfigForm({
  triggerType, triggerConfig, funnels, tags, broadcasts, workspaceEmails,
  workflowId, onTypeChange, onConfigChange,
}: {
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  funnels: Props["funnels"];
  tags: Props["tags"];
  broadcasts: Props["broadcasts"];
  workspaceEmails: WorkspaceEmailMini[];
  workflowId: string;
  onTypeChange: (t: string) => void;
  onConfigChange: (c: Record<string, unknown>) => void;
}) {
  const inp = "w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500";
  const lbl = "block text-[11px] uppercase font-semibold tracking-wider text-gray-500 mb-1";
  const funnelId = (triggerConfig.funnelId as string | undefined) ?? "";
  const funnel = funnels.find((f) => f.id === funnelId);
  const isTagTrigger        = triggerType === "TAG_ADDED" || triggerType === "TAG_REMOVED";
  const isFunnelScoped      = FUNNEL_SCOPED_TRIGGERS.has(triggerType);
  const isEmailScoped       = EMAIL_SCOPED_TRIGGERS.has(triggerType);
  const isLinkClickTrigger  = triggerType === "EMAIL_LINK_CLICKED";
  const description         = TRIGGER_DESCRIPTIONS[triggerType];
  const eligibleStepTypes   = STEP_TYPES_PER_TRIGGER[triggerType] ?? [];

  // Steps in the chosen funnel that this trigger can actually fire on. E.g.
  // for NEW_SALE we only show CHECKOUT / UPSELL / DOWNSELL steps — there's no
  // point letting the operator pick an OPTIN step because no sale event will
  // ever come from it.
  const eligibleSteps = funnel
    ? (eligibleStepTypes.length > 0
        ? funnel.steps.filter((s) => eligibleStepTypes.includes(s.type))
        : funnel.steps)
    : [];

  // Switching trigger types: clear filters that don't apply to the new type
  // so stale ids don't silently restrict matching on the next save.
  function handleTypeChange(next: string) {
    const nextIsTag    = next === "TAG_ADDED" || next === "TAG_REMOVED";
    const nextIsFunnel = FUNNEL_SCOPED_TRIGGERS.has(next);
    const nextIsEmail  = EMAIL_SCOPED_TRIGGERS.has(next);
    const cleaned: Record<string, unknown> = { ...triggerConfig };
    if (!nextIsTag)    { delete cleaned.tagId; }
    if (!nextIsFunnel) { delete cleaned.funnelId; delete cleaned.funnelStepId; }
    if (!nextIsEmail)  {
      delete cleaned.source;
      delete cleaned.broadcastId;
      delete cleaned.workflowEmailId;
      delete cleaned.linkUrl;
    }
    // EMAIL_OPENED never takes linkUrl — only EMAIL_LINK_CLICKED does. Strip
    // so switching trigger types within the email family doesn't leave a
    // stale link filter behind.
    if (next !== "EMAIL_LINK_CLICKED") delete cleaned.linkUrl;
    // Legacy stepType field from earlier UI iteration — strip on any switch
    // so it doesn't silently restrict matching. Server-side matcher still
    // honors it for any workflow rows that still have it persisted.
    delete cleaned.stepType;
    onTypeChange(next);
    onConfigChange(cleaned);
  }

  return (
    <div className="space-y-3">
      <div>
        <label className={lbl}>When</label>
        <RichSelect
          value={triggerType}
          onChange={handleTypeChange}
          options={TRIGGER_TYPES.map((t) => ({
            value:       t,
            label:       triggerHumanLabel(t),
            description: TRIGGER_DESCRIPTIONS[t] ?? "",
            Icon:        TRIGGER_ICONS[t] ?? Zap,
          }))}
        />
        {/* Keep a persistent description under the closed picker — once
            picked, the operator shouldn't need to reopen the dropdown to
            recall what their selected trigger does. */}
        {description && (
          <p className="text-[11px] text-gray-500 mt-1.5 leading-snug">{description}</p>
        )}
      </div>

      {/* TAG_ADDED / TAG_REMOVED need the specific tag wired here so the
          executor knows which tag firing triggers this workflow. Without it,
          the trigger would fire for ANY tag change — almost never what the
          operator wants. */}
      {isTagTrigger && (
        <div>
          <label className={lbl}>Tag</label>
          <select
            className={inp}
            value={(triggerConfig.tagId as string | undefined) ?? ""}
            onChange={(e) => onConfigChange({ ...triggerConfig, tagId: e.target.value || undefined })}
          >
            <option value="">— pick a tag —</option>
            {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      )}

      {/* EMAIL_OPENED / EMAIL_LINK_CLICKED scope to a specific email via a
          source discriminator. "broadcast" lists workspace broadcasts;
          "workflow_email" lists every workflow email across all workflows
          in the workspace (cross-workflow chain pattern). Without a source
          + concrete id the trigger would fire for every open/click in the
          workspace, which we explicitly block in validation. */}
      {isEmailScoped && (
        <EmailTriggerSourcePicker
          triggerConfig={triggerConfig}
          broadcasts={broadcasts}
          workspaceEmails={workspaceEmails}
          workflowId={workflowId}
          showLinkPicker={isLinkClickTrigger}
          onConfigChange={onConfigChange}
        />
      )}

      {/* Funnel + Step filters — sequential. User picks a funnel first, then
          the Step dropdown lists only steps from that funnel that can
          actually emit this trigger (e.g. NEW_SALE → only CHECKOUT/UPSELL/
          DOWNSELL steps, not OPTIN). Each step shows its type in the label
          so the operator can pick the right one at a glance. */}
      {isFunnelScoped && (
        <>
          <div>
            <label className={lbl}>Funnel</label>
            <select
              className={inp}
              value={funnelId}
              onChange={(e) => onConfigChange({ ...triggerConfig, funnelId: e.target.value || undefined, funnelStepId: undefined })}
            >
              <option value="">— pick funnel —</option>
              {funnels.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          {funnel && (
            <div>
              <label className={lbl}>Step</label>
              <select
                className={inp}
                value={(triggerConfig.funnelStepId as string | undefined) ?? ""}
                onChange={(e) => onConfigChange({ ...triggerConfig, funnelStepId: e.target.value || undefined })}
              >
                <option value="">— pick step —</option>
                {eligibleSteps.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.type.toLowerCase()})</option>)}
              </select>
              {eligibleSteps.length === 0 && (
                <p className="text-[10px] text-amber-600 mt-1">
                  No steps in this funnel can emit a {triggerHumanLabel(triggerType)} event.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Email source + optional link-filter picker for the EMAIL_OPENED /
// EMAIL_LINK_CLICKED triggers. Two-step UX matching how operators think
// about it: "which kind of email?" → "which specific one?" → (optional)
// "which link?". The link options list is fetched on demand from the
// email-links endpoint when source+id are set + showLinkPicker is true.
function EmailTriggerSourcePicker({
  triggerConfig, broadcasts, workspaceEmails, workflowId, showLinkPicker, onConfigChange,
}: {
  triggerConfig:    Record<string, unknown>;
  broadcasts:       Props["broadcasts"];
  workspaceEmails:  WorkspaceEmailMini[];
  workflowId:       string;
  showLinkPicker:   boolean;
  onConfigChange:   (c: Record<string, unknown>) => void;
}) {
  const inp = "w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500";
  const lbl = "block text-[11px] uppercase font-semibold tracking-wider text-gray-500 mb-1";

  const source          = (triggerConfig.source          as string | undefined) ?? "";
  const broadcastId     = (triggerConfig.broadcastId     as string | undefined) ?? "";
  const workflowEmailId = (triggerConfig.workflowEmailId as string | undefined) ?? "";
  const linkUrl         = (triggerConfig.linkUrl         as string | undefined) ?? "";

  const sourceId =
    source === "broadcast"      ? broadcastId :
    source === "workflow_email" ? workflowEmailId : "";

  // Switching source kind clears the other side's id + the link filter so
  // we never carry a stale broadcastId when the operator picks
  // "workflow_email" (or vice versa).
  function onSourceChange(next: string) {
    const cleaned: Record<string, unknown> = { ...triggerConfig };
    cleaned.source = next || undefined;
    delete cleaned.broadcastId;
    delete cleaned.workflowEmailId;
    delete cleaned.linkUrl;
    onConfigChange(cleaned);
  }

  function onSourceIdChange(next: string) {
    const cleaned: Record<string, unknown> = { ...triggerConfig };
    if (source === "broadcast")           cleaned.broadcastId     = next || undefined;
    else if (source === "workflow_email") cleaned.workflowEmailId = next || undefined;
    // Picking a different email invalidates the link-filter (its options
    // came from the previous email's body).
    delete cleaned.linkUrl;
    onConfigChange(cleaned);
  }

  return (
    <>
      <div>
        <label className={lbl}>Source</label>
        <select className={inp} value={source} onChange={(e) => onSourceChange(e.target.value)}>
          <option value="">— pick a source —</option>
          <option value="broadcast">Broadcast</option>
          <option value="workflow_email">Workflow email</option>
        </select>
      </div>

      {source === "broadcast" && (
        <div>
          <label className={lbl}>Broadcast</label>
          <select className={inp} value={broadcastId} onChange={(e) => onSourceIdChange(e.target.value)}>
            <option value="">— pick a broadcast —</option>
            {broadcasts.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}{b.sentAt ? "" : " (draft)"}
              </option>
            ))}
          </select>
          {broadcasts.length === 0 && (
            <p className="text-[10px] text-amber-600 mt-1">
              No broadcasts in this workspace yet — create one first.
            </p>
          )}
        </div>
      )}

      {source === "workflow_email" && (
        <div>
          <label className={lbl}>Workflow email</label>
          <select className={inp} value={workflowEmailId} onChange={(e) => onSourceIdChange(e.target.value)}>
            <option value="">— pick a workflow email —</option>
            {workspaceEmails.map((e) => (
              <option key={e.id} value={e.id}>
                {e.workflowName} · {e.name || e.subject || "(untitled)"}
              </option>
            ))}
          </select>
          {workspaceEmails.length === 0 && (
            <p className="text-[10px] text-amber-600 mt-1">
              No workflow emails in this workspace yet — add a Send email step in any workflow first.
            </p>
          )}
        </div>
      )}

      {showLinkPicker && source && sourceId && (
        <LinkFilterPicker
          workflowId={workflowId}
          source={source}
          sourceId={sourceId}
          linkUrl={linkUrl}
          onChange={(next) => onConfigChange({ ...triggerConfig, linkUrl: next || undefined })}
        />
      )}
    </>
  );
}

// Loads the distinct hrefs found in the picked email's bodyHtml via
// /api/workflows/[id]/email-links and renders them as a dropdown. "Any
// link" leaves linkUrl undefined → trigger fires on any click in that
// email. Custom URLs / substring filters can be typed in the free-text
// fallback below for cases where the bodyHtml hasn't been finalized yet.
function LinkFilterPicker({
  workflowId, source, sourceId, linkUrl, onChange,
}: {
  workflowId: string;
  source:     string;
  sourceId:   string;
  linkUrl:    string;
  onChange:   (next: string) => void;
}) {
  const inp = "w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500";
  const lbl = "block text-[11px] uppercase font-semibold tracking-wider text-gray-500 mb-1";

  const [urls, setUrls]     = useState<string[]>([]);
  const [state, setState]   = useState<"idle" | "loading" | "loaded" | "error">("idle");

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    apiFetch(`/api/workflows/${workflowId}/email-links?source=${source}&sourceId=${sourceId}`)
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then((data) => {
        if (cancelled) return;
        const arr = Array.isArray(data?.data?.urls) ? (data.data.urls as string[]) : [];
        setUrls(arr);
        setState("loaded");
      })
      .catch(() => { if (!cancelled) setState("error"); });
    return () => { cancelled = true; };
  }, [workflowId, source, sourceId]);

  // The picked linkUrl may be a substring (user can hand-edit) so the
  // dropdown value falls back to "" (= "Any link") whenever the configured
  // string isn't an exact match for one of the discovered URLs. That keeps
  // the dropdown honest without erasing the saved value.
  const matchesKnown = linkUrl && urls.includes(linkUrl);
  const dropdownValue = matchesKnown ? linkUrl : (linkUrl ? "__custom__" : "");

  return (
    <div className="space-y-2 border-t border-gray-100 pt-2">
      <div>
        <label className={lbl}>Link filter <span className="text-gray-400 font-normal normal-case tracking-normal">(optional)</span></label>
        <select
          className={inp}
          value={dropdownValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "")               onChange("");           // Any link
            else if (v === "__custom__") return;                // keep custom URL as-is
            else                        onChange(v);
          }}
          disabled={state === "loading"}
        >
          <option value="">Any link in this email</option>
          {urls.map((u) => (
            <option key={u} value={u}>{truncateMiddle(u, 50)}</option>
          ))}
          {linkUrl && !matchesKnown && (
            <option value="__custom__">Custom: {truncateMiddle(linkUrl, 40)}</option>
          )}
        </select>
        {state === "loading" && <p className="text-[10px] text-gray-400 mt-1">Loading links…</p>}
        {state === "loaded" && urls.length === 0 && (
          <p className="text-[10px] text-amber-600 mt-1">
            No tracked links in this email's body yet. Type a URL or substring below to match by pattern.
          </p>
        )}
        {state === "error" && (
          <p className="text-[10px] text-amber-600 mt-1">
            Couldn't load links — type a URL or substring below.
          </p>
        )}
      </div>
      <div>
        <label className={lbl}>Or match URL substring</label>
        <input
          type="text"
          className={inp}
          value={linkUrl}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. /welcome or https://app.com/checkout"
        />
        <p className="text-[10px] text-gray-400 mt-1">
          Matches if the clicked URL contains this text. Leave empty for any link.
        </p>
      </div>
    </div>
  );
}

function truncateMiddle(s: string, n: number): string {
  if (s.length <= n) return s;
  const head = Math.ceil((n - 1) / 2);
  const tail = Math.floor((n - 1) / 2);
  return s.slice(0, head) + "…" + s.slice(s.length - tail);
}

// ─── Per-node-type config form ─────────────────────────────────────────────

function NodeConfigForm({
  type, config, onChange, tags, funnels, broadcasts,
  workflowEmails, workspaceSlug, workflowId, workflowTriggerType, isLocked,
}: {
  type: NodeType;
  config: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
  tags: Props["tags"];
  funnels: Props["funnels"];
  broadcasts: Props["broadcasts"];
  workflowEmails:        WorkflowEmailMini[];
  workspaceSlug:         string;
  workflowId:            string;
  /** The parent workflow's triggerType. WEBHOOK uses it to populate the
      `type` field in the payload-preview JSON so the operator sees the
      exact shape their receiver will get. */
  workflowTriggerType:   string;
  /** When true, hide write affordances (Create new email). Form controls
      are already disabled by the wrapping modal fieldset. */
  isLocked:              boolean;
}) {
  const inp  = "w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500";
  const lbl  = "block text-[11px] uppercase font-semibold tracking-wider text-gray-500 mb-1";

  if (type === "SEND_EMAIL") {
    // Compact picker: the workflow editor only links a node to a saved
    // WorkflowEmail. All content editing (subject, sender, body) happens on
    // the dedicated editor page reached via Edit / Create — same pattern as
    // Broadcast where the listing links out to a fullscreen maily.to editor.
    const emailId = config.emailId as string | undefined;
    const email   = emailId ? workflowEmails.find((e) => e.id === emailId) : undefined;
    const editUrl = (id: string) => `/${workspaceSlug}/workflows/${workflowId}/emails/${id}/edit`;
    const manageUrl = `/${workspaceSlug}/workflows/${workflowId}/emails`;

    return (
      <div className="space-y-3">
        <div>
          {/* Header row: the field label sits on the left, a small "Manage
              emails" link on the right gives access to the listing page (the
              only place to find + delete orphan emails). Replaces the
              workflow-editor top bar entry that used to live next to Runs —
              this is the contextually right home for it. */}
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] uppercase font-semibold tracking-wider text-gray-500">Email</span>
            <a
              href={manageUrl}
              className="text-[11px] font-medium text-gray-500 hover:text-gray-900 hover:underline"
              title="View, edit, or delete all emails of this workflow"
            >
              Manage emails{workflowEmails.length > 0 ? ` (${workflowEmails.length})` : ""}
            </a>
          </div>
          {workflowEmails.length > 0 ? (
            <select
              className={inp}
              value={emailId ?? ""}
              onChange={(e) => onChange({ emailId: e.target.value || null })}
            >
              <option value="">— pick an email —</option>
              {workflowEmails.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name || e.subject || "(untitled)"}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-[11px] text-gray-500 italic">
              No emails in this workflow yet. Create one below — come back and pick it from this dropdown.
            </p>
          )}
        </div>

        {/* Live summary of the picked email so the operator can verify they
            wired the right one without opening the editor. "Edit this email"
            sits inline with the Preview caption — same row, right side —
            since editing the picked email is the natural follow-up action
            when looking at its preview. */}
        {email && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 space-y-1">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase font-semibold tracking-wider text-gray-500">Preview</div>
              <a
                href={editUrl(email.id)}
                className="text-[11px] font-medium text-blue-600 hover:text-blue-700 hover:underline"
              >
                Edit this email
              </a>
            </div>
            <div className="text-xs font-medium text-gray-900 truncate">
              {email.subject || <span className="italic text-gray-400">No subject</span>}
            </div>
            <div className="text-[11px] text-gray-500 truncate">
              From: {email.fromName ? `${email.fromName} <${email.fromEmail}>` : <span className="italic">No sender</span>}
            </div>
          </div>
        )}

        {/* Create stays on its own row — it's the "I want a fresh email"
            escape hatch and shouldn't read as paired with Edit. Navigates
            to the dedicated /emails/new page; no DB row is created until
            the operator clicks Save in the editor, so abandoning the page
            doesn't leave an orphan email behind. Hidden when the workflow
            is ACTIVE — the editor's Save would 409. */}
        {!isLocked && (
          <div className="text-[11px] text-gray-500">
            <a
              href={`/${workspaceSlug}/workflows/${workflowId}/emails/new`}
              className="font-medium text-gray-600 hover:text-gray-900 hover:underline"
            >
              + Create new email
            </a>
          </div>
        )}
      </div>
    );
  }

  if (type === "ADD_TAG" || type === "REMOVE_TAG") {
    return (
      <div>
        <label className={lbl}>Tag</label>
        <select className={inp} value={(config.tagId as string) ?? ""} onChange={(e) => onChange({ tagId: e.target.value })}>
          <option value="">— pick tag —</option>
          {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
    );
  }

  if (type === "WEBHOOK") {
    return (
      <WebhookForm
        config={config}
        onChange={onChange}
        triggerType={workflowTriggerType}
        inp={inp}
        lbl={lbl}
      />
    );
  }

  if (type === "DELAY") {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className={lbl}>Days</label>
            <input type="number" min={0} className={inp} value={(config.days as number) ?? 0} onChange={(e) => onChange({ days: Number(e.target.value) })} />
          </div>
          <div>
            <label className={lbl}>Hours</label>
            <input type="number" min={0} className={inp} value={(config.hours as number) ?? 0} onChange={(e) => onChange({ hours: Number(e.target.value) })} />
          </div>
          <div>
            <label className={lbl}>Min</label>
            <input type="number" min={0} className={inp} value={(config.minutes as number) ?? 0} onChange={(e) => onChange({ minutes: Number(e.target.value) })} />
          </div>
        </div>
        <p className="text-[10px] text-gray-500">Total: {totalDelayLabel(config)}</p>
      </div>
    );
  }

  if (type === "CONDITION") {
    const kind = (config.kind as string) ?? "contact_tag";
    return (
      <div className="space-y-3">
        <div>
          <label className={lbl}>Kind</label>
          <RichSelect
            value={kind}
            onChange={(v) => onChange({ kind: v })}
            options={CONDITION_KIND_OPTIONS}
          />
        </div>
        {kind === "contact_tag" && (
          <>
            <div>
              <label className={lbl}>Operator</label>
              <select
                className={inp}
                value={(config.operator as string) ?? "has"}
                onChange={(e) => onChange({ operator: e.target.value })}
              >
                <option value="has">Has tag</option>
                <option value="does_not_have">Does not have tag</option>
              </select>
            </div>
            <div>
              <label className={lbl}>Tag</label>
              <select className={inp} value={(config.tagId as string) ?? ""} onChange={(e) => onChange({ tagId: e.target.value })}>
                <option value="">— pick tag —</option>
                {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </>
        )}
        {kind === "contact_field" && (
          <>
            <div>
              <label className={lbl}>Field</label>
              <select className={inp} value={(config.field as string) ?? "email"} onChange={(e) => onChange({ field: e.target.value })}>
                {["email", "firstName", "lastName", "phone", "country", "company"].map((f) => <option key={f}>{f}</option>)}
              </select>
            </div>
            <CompareFields config={config} onChange={onChange} />
          </>
        )}
        {kind === "contact_purchased" && (
          <p className="text-[10px] text-gray-500 leading-snug">
            Returns true if the contact placed a PAID order after this run started.
            By default scopes to the trigger&apos;s funnel step.
          </p>
        )}
        {(kind === "email_opened" || kind === "email_clicked") && (() => {
          const verb     = kind === "email_opened" ? "opened" : "clicked any link in";
          const source   = (config.source as string | undefined) ?? "";
          // Source narrows what's checked since the run started:
          //   "broadcast"      → the picked broadcast specifically
          //   "workflow_email" → the picked workflow email (this workflow only,
          //                      to keep the picker tight and predictable)
          function onSourceChange(next: string) {
            const cleaned: Record<string, unknown> = { ...config };
            cleaned.source = next || undefined;
            delete cleaned.broadcastId;
            delete cleaned.workflowEmailId;
            onChange(cleaned);
          }
          return (
            <>
              <div>
                <label className={lbl}>Source</label>
                <select className={inp} value={source} onChange={(e) => onSourceChange(e.target.value)}>
                  <option value="">— pick a source —</option>
                  <option value="broadcast">Specific broadcast</option>
                  <option value="workflow_email">Workflow email (this workflow)</option>
                </select>
              </div>
              {source === "broadcast" && (
                <div>
                  <label className={lbl}>Broadcast</label>
                  <select
                    className={inp}
                    value={(config.broadcastId as string) ?? ""}
                    onChange={(e) => onChange({ broadcastId: e.target.value || undefined })}
                  >
                    <option value="">— pick a broadcast —</option>
                    {broadcasts.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}{b.sentAt ? "" : " (draft)"}
                      </option>
                    ))}
                  </select>
                  {broadcasts.length === 0 && (
                    <p className="text-[10px] text-amber-600 mt-1">
                      No broadcasts in this workspace yet.
                    </p>
                  )}
                </div>
              )}
              {source === "workflow_email" && (
                <div>
                  <label className={lbl}>Workflow email</label>
                  <select
                    className={inp}
                    value={(config.workflowEmailId as string) ?? ""}
                    onChange={(e) => onChange({ workflowEmailId: e.target.value || undefined })}
                  >
                    <option value="">— pick a workflow email —</option>
                    {workflowEmails.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name || e.subject || "(untitled)"}
                      </option>
                    ))}
                  </select>
                  {workflowEmails.length === 0 && (
                    <p className="text-[10px] text-amber-600 mt-1">
                      No Send email steps in this workflow yet — add one first.
                    </p>
                  )}
                </div>
              )}
              <p className="text-[10px] text-gray-500 leading-snug">
                Returns true if the contact {verb} a matching email after this run started.
              </p>
            </>
          );
        })()}
        <p className="text-[10px] text-gray-500">Connect two outgoing edges — they'll be labeled <b>true</b> and <b>false</b> automatically. For "exit when goal met" patterns, wire the <b>true</b> branch to an End node.</p>
      </div>
    );
  }

  if (type === "END") {
    return (
      <div className="space-y-3">
        <p className="text-xs text-gray-500">Terminates this branch. The run is marked COMPLETED.</p>
        <div>
          <label className={lbl}>Exit reason <span className="text-gray-400 font-normal normal-case tracking-normal">(optional)</span></label>
          <input
            className={inp}
            value={(config.reason as string) ?? ""}
            onChange={(e) => onChange({ reason: e.target.value })}
            placeholder="e.g. purchased, subscribed"
          />
          <p className="text-[10px] text-gray-400 mt-1">Surfaces in run.exitReason for analytics. Use to distinguish early-exit branches (purchased) from natural completion.</p>
        </div>
      </div>
    );
  }

  return null;
}

// WEBHOOK config form — URL + method + custom headers + payload preview.
//
// Headers are stored on disk as an array of [key, value] tuples so the
// builder UI can preserve insertion order. The executor converts to an
// object before spreading into the fetch() headers map.
//
// Values are NOT masked client-side beyond `type="password"`. Bearer
// tokens / API keys end up in the workflow JSON in plaintext — see
// SECURITY NOTE in execWebhook() about the planned secret vault.
function WebhookForm({
  config, onChange, triggerType, inp, lbl,
}: {
  config:      Record<string, unknown>;
  onChange:    (patch: Record<string, unknown>) => void;
  triggerType: string;
  inp:         string;
  lbl:         string;
}) {
  // Payload preview is reference material — most operators won't need it on
  // every visit. Collapsed by default; expand to inspect or copy the JSON
  // shape. Local state (not persisted) — purely a view preference.
  const [showPreview, setShowPreview] = useState(false);

  // Normalize header storage to an array of [k,v] tuples regardless of how
  // it was last saved (legacy object shape is still accepted by the
  // executor; this normalizer means an old workflow opens cleanly).
  const rawHeaders = config.headers as unknown;
  const headers: Array<[string, string]> = Array.isArray(rawHeaders)
    ? (rawHeaders.filter(
        (e) => Array.isArray(e) && e.length === 2,
      ) as Array<[string, string]>)
    : rawHeaders && typeof rawHeaders === "object"
      ? Object.entries(rawHeaders as Record<string, string>)
      : [];

  const updateHeaders = (next: Array<[string, string]>) => {
    onChange({ headers: next });
  };
  const setKey   = (i: number, k: string) => updateHeaders(headers.map((row, idx) => idx === i ? [k, row[1]] : row));
  const setValue = (i: number, v: string) => updateHeaders(headers.map((row, idx) => idx === i ? [row[0], v] : row));
  const removeRow = (i: number)            => updateHeaders(headers.filter((_, idx) => idx !== i));
  const addRow    = (k = "", v = "")       => updateHeaders([...headers, [k, v]]);

  // Build the same payload shape execWebhook() sends, populated with sample
  // values the operator can recognize. Anything that depends on workflow
  // runtime (workspaceId, runId, etc.) is shown as a placeholder.
  const sampleType = (triggerType || "").toLowerCase();
  const preview = JSON.stringify({
    type:        sampleType,
    workspaceId: "ws_xxx",
    data: {
      workflowId: "wf_xxx",
      runId:      "run_xxx",
      nodeId:     "node_xxx",
      contact: {
        id:        "c_xxx",
        email:     "alice@example.com",
        firstName: "Alice",
        lastName:  "Wonderland",
      },
      trigger: sampleTriggerData(triggerType),
      context: {},
    },
    sentAt: "2026-06-03T12:34:56.000Z",
  }, null, 2);

  return (
    <div className="space-y-3">
      <div>
        <label className={lbl}>URL</label>
        <input
          className={inp}
          value={(config.url as string) ?? ""}
          onChange={(e) => onChange({ url: e.target.value })}
          placeholder="https://…"
        />
      </div>
      <div>
        <label className={lbl}>Method</label>
        <select
          className={inp}
          value={(config.method as string) ?? "POST"}
          onChange={(e) => onChange({ method: e.target.value })}
        >
          <option>POST</option><option>GET</option><option>PUT</option><option>PATCH</option>
        </select>
      </div>

      {/* Headers editor */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] uppercase font-semibold tracking-wider text-gray-500">Headers</span>
          <button
            type="button"
            onClick={() => addRow("Authorization", "Bearer ")}
            className="text-[11px] font-medium text-gray-500 hover:text-gray-900 hover:underline"
            title="Insert an Authorization Bearer row"
          >
            + Bearer token
          </button>
        </div>
        {headers.length === 0 ? (
          <p className="text-[11px] text-gray-500 italic mb-1">
          </p>
        ) : (
          <div className="space-y-1.5">
            {headers.map(([k, v], i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input
                  className={`${inp} flex-1`}
                  value={k}
                  onChange={(e) => setKey(i, e.target.value)}
                  placeholder="Header name"
                  spellCheck={false}
                  autoComplete="off"
                />
                <input
                  className={`${inp} flex-[1.4] font-mono`}
                  type="password"
                  value={v}
                  onChange={(e) => setValue(i, e.target.value)}
                  placeholder="Value"
                  spellCheck={false}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  className="p-1 text-gray-400 hover:text-red-600"
                  title="Remove header"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => addRow()}
          className="mt-1.5 text-[11px] font-medium text-gray-500 hover:text-gray-900 hover:underline"
        >
          + Add header
        </button>
        <p className="text-[10px] text-gray-400 mt-1.5 leading-snug">
          Values are stored as part of this workflow. Don&apos;t share workflow exports that contain API keys.
        </p>
      </div>

      {/* Payload preview — collapsed by default. The default-on body shape
          is documented in the worker's execWebhook(); we only surface it in
          UI when the operator asks. Keeps the WEBHOOK panel from being
          overwhelmed by a wall of sample JSON. */}
      <div>
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          className="flex items-center gap-1 group"
          aria-expanded={showPreview}
        >
          <ChevronDown
            size={11}
            className={`text-gray-400 transition-transform ${showPreview ? "" : "-rotate-90"}`}
          />
          <span className="text-[11px] uppercase font-semibold tracking-wider text-gray-500 group-hover:text-gray-700">
            Payload preview
          </span>
        </button>
        {showPreview && (
          <div className="mt-1.5">
            <div className="flex items-center justify-end mb-1">
              <button
                type="button"
                onClick={() => { void navigator.clipboard.writeText(preview).catch(() => {}); }}
                className="text-[11px] font-medium text-gray-500 hover:text-gray-900 hover:underline"
                title="Copy this JSON shape to clipboard"
              >
                Copy
              </button>
            </div>
            <pre className="text-[10px] font-mono leading-snug bg-gray-50 border border-gray-200 rounded-lg p-2 max-h-56 overflow-auto whitespace-pre">
{preview}
            </pre>
            <p className="text-[10px] text-gray-400 mt-1 leading-snug">
              Receiver code should switch on <code className="bg-gray-100 px-1 rounded">type</code>; runtime values
              (IDs, contact, trigger) replace the placeholders above.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Sample trigger context per type — picked so the operator sees fields they'll
// actually receive at runtime. Keep keys aligned with what fireTrigger writes.
function sampleTriggerData(triggerType: string): Record<string, unknown> {
  switch (triggerType) {
    case "NEW_SALE":
    case "SALE_CANCELED":
      return { orderId: "ord_xxx", orderTotal: 4900, orderCurrency: "usd", funnelId: "fnl_xxx", funnelStepId: "stp_xxx" };
    case "SUBSCRIPTION_PAYMENT_FAILED":
      return { subscriptionId: "sub_xxx", funnelId: "fnl_xxx", funnelStepId: "stp_xxx" };
    case "FORM_SUBMIT":
    case "CHECKOUT_STARTED":
      return { funnelId: "fnl_xxx", funnelStepId: "stp_xxx" };
    case "TAG_ADDED":
    case "TAG_REMOVED":
      return { tagId: "tag_xxx" };
    case "EMAIL_OPENED":
      return { emailSendId: "es_xxx", broadcastId: "bc_xxx" };
    case "EMAIL_LINK_CLICKED":
      return { emailSendId: "es_xxx", broadcastId: "bc_xxx", linkUrl: "https://app.example.com/cta" };
    default:
      return {};
  }
}

// Compact 4-operator picker matching Systeme.io's Decision UX. Strings only —
// profile fields in launchtic are all strings (email, firstName, etc.).
function CompareFields({ config, onChange }: { config: Record<string, unknown>; onChange: (p: Record<string, unknown>) => void }) {
  const inp = "w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500";
  const lbl = "block text-[11px] uppercase font-semibold tracking-wider text-gray-500 mb-1";
  return (
    <>
      <div>
        <label className={lbl}>Operator</label>
        <select className={inp} value={(config.operator as string) ?? "equals"} onChange={(e) => onChange({ operator: e.target.value })}>
          <option value="equals">Equals</option>
          <option value="begins">Begins with</option>
          <option value="contains">Contains</option>
          <option value="ends">Ends with</option>
        </select>
      </div>
      <div>
        <label className={lbl}>Value</label>
        <input
          type="text"
          className={inp}
          value={(config.value as string) ?? ""}
          onChange={(e) => onChange({ value: e.target.value })}
        />
      </div>
    </>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function edgeToRf(e: WorkflowEdge): Edge {
  return buildNormalEdge(e.id, e.source, e.target, e.label, { weight: e.weight });
}

function buildNormalEdge(id: string, source: string, target: string, label?: string, extraData?: Record<string, unknown>): Edge {
  return {
    id, source, target, label,
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
    style: { stroke: "#94a3b8", strokeWidth: 1.5 },
    labelStyle: { fontSize: 11, fontWeight: 600, fill: label === "true" ? "#059669" : label === "false" ? "#dc2626" : "#64748b" },
    labelBgStyle: { fill: "white" },
    data: { ...(extraData ?? {}) },
  };
}

function styleTriggerEdge(e: { id: string; source: string; target: string }): Edge {
  return {
    id: e.id, source: e.source, target: e.target,
    // "straight" goes point-to-point — no rounded corners or curves. Since we
    // post-process trigger position to be perfectly above the first step,
    // source and target handles are vertically aligned and this renders as a
    // clean straight vertical line.
    type: "straight",
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: "#2563eb" },
    style: { stroke: "#2563eb", strokeWidth: 2 },
  };
}

function nodeSubtitle(
  type: NodeType,
  config: Record<string, unknown>,
  tags: Props["tags"],
  funnels: Props["funnels"],
  broadcasts: Props["broadcasts"],
  workflowEmails: WorkflowEmailMini[],
): string | undefined {
  if (type === "SEND_EMAIL") {
    const emailId = config.emailId as string | undefined;
    const email = emailId ? workflowEmails.find((e) => e.id === emailId) : undefined;
    return email?.subject || undefined;
  }
  if (type === "ADD_TAG" || type === "REMOVE_TAG") {
    const id = config.tagId as string | undefined;
    const tag = tags.find((t) => t.id === id);
    return tag?.name;
  }
  if (type === "WEBHOOK") return (config.url as string) || undefined;
  if (type === "DELAY")   return totalDelayLabel(config);
  if (type === "CONDITION") return conditionSubtitle(config, tags, funnels, broadcasts, workflowEmails);
  if (type === "END")     return (config.reason as string) || undefined;
  return undefined;
}

// Human-readable one-liner for the CONDITION card subtitle. Falls back to a
// "configure me" hint when the kind is set but its required fields aren't.
function conditionSubtitle(
  config: Record<string, unknown>,
  tags: Props["tags"],
  funnels: Props["funnels"],
  broadcasts: Props["broadcasts"],
  workflowEmails: WorkflowEmailMini[],
): string | undefined {
  const kind = config.kind as string | undefined;
  if (!kind) return undefined;
  switch (kind) {
    case "contact_tag": {
      const tagId    = config.tagId    as string | undefined;
      const operator = (config.operator as string | undefined) ?? "has";
      const verb     = operator === "does_not_have" ? "does not have tag" : "has tag";
      if (!tagId) return `if ${verb} …`;
      const tag = tags.find((t) => t.id === tagId);
      return tag ? `if ${verb} "${tag.name}"` : `if ${verb} …`;
    }
    case "contact_purchased":
      return "if contact purchased";
    case "email_opened":
    case "email_clicked": {
      const verb   = kind === "email_opened" ? "opened" : "clicked";
      const source = config.source as string | undefined;
      if (!source) return `if ${verb} … (pick source)`;
      if (source === "broadcast") {
        const id = config.broadcastId as string | undefined;
        if (!id) return `if ${verb} broadcast …`;
        const b = broadcasts.find((x) => x.id === id);
        return b ? `if ${verb} "${b.name}"` : `if ${verb} broadcast …`;
      }
      if (source === "workflow_email") {
        const id = config.workflowEmailId as string | undefined;
        if (!id) return `if ${verb} workflow email …`;
        const e = workflowEmails.find((x) => x.id === id);
        return e ? `if ${verb} "${e.name || e.subject || "(untitled)"}"` : `if ${verb} workflow email …`;
      }
      return `if ${verb} …`;
    }
    case "contact_field": {
      const field    = config.field    as string | undefined;
      const operator = config.operator as string | undefined;
      const value    = config.value;
      if (!field || !operator) return "if contact field …";
      const valStr = value == null || value === "" ? "…" : String(value);
      return `if ${field} ${operatorLabel(operator)} "${valStr}"`;
    }
    default:
      return kind;
  }
  // funnels arg kept in signature so we don't ripple call-site changes if we
  // re-add trigger_funnel kind later. Currently unused.
  void funnels;
}

function operatorLabel(op: string): string {
  switch (op) {
    case "equals":   return "equals";
    case "begins":   return "begins with";
    case "contains": return "contains";
    case "ends":     return "ends with";
    default:         return op;
  }
}

function describeTriggerScope(triggerConfig: Record<string, unknown>, funnels: Props["funnels"]): string | null {
  const funnelId = triggerConfig.funnelId as string | undefined;
  if (!funnelId) return null;
  const funnel = funnels.find((f) => f.id === funnelId);
  if (!funnel) return "(funnel deleted)";
  const stepId = triggerConfig.funnelStepId as string | undefined;
  if (!stepId) return funnel.name;
  const step = funnel.steps.find((s) => s.id === stepId);
  return step ? `${funnel.name} · ${step.name}` : funnel.name;
}

// Returns true if the node's current config carries non-default content
// the operator might not want to silently discard. Drives the confirm modal
// in the type-switcher header.
function hasNodeContent(
  type: NodeType,
  config: Record<string, unknown>,
  workflowEmails: WorkflowEmailMini[],
): boolean {
  switch (type) {
    case "SEND_EMAIL": {
      const emailId = config.emailId as string | undefined;
      if (!emailId) return false;
      const email = workflowEmails.find((e) => e.id === emailId);
      if (!email) return false;
      return !!(email.subject.trim() || email.bodyHtml.trim());
    }
    case "ADD_TAG":
    case "REMOVE_TAG":
      return !!(config.tagId && String(config.tagId).trim());
    case "WEBHOOK":
      return !!(config.url && String(config.url).trim());
    case "DELAY":
      return Number(config.days ?? 0) > 0
          || Number(config.hours ?? 0) > 0
          || Number(config.minutes ?? 0) > 0;
    case "CONDITION":
      // Any sub-field beyond the default kind hint counts as content.
      return !!(
        config.tagId           ||
        config.field           ||
        config.value           ||
        config.operator        ||
        config.source          ||
        config.broadcastId     ||
        config.workflowEmailId
      );
    case "END":
      return !!(config.reason && String(config.reason).trim());
    default:
      return false;
  }
}

// Bullet list shown in the confirm modal — what the operator loses by
// switching type. Keep the strings short and concrete.
function getDiscardSummary(
  type: NodeType,
  config: Record<string, unknown>,
  workflowEmails: WorkflowEmailMini[],
): string[] {
  switch (type) {
    case "SEND_EMAIL": {
      const emailId = config.emailId as string | undefined;
      const email   = emailId ? workflowEmails.find((e) => e.id === emailId) : undefined;
      const out: string[] = [];
      if (email?.subject?.trim())  out.push(`Email subject "${truncate(email.subject, 36)}"`);
      if (email?.bodyHtml?.trim()) out.push("Email body content");
      if (email?.senderId)         out.push("Sender pick");
      return out.length ? out : ["The linked email and its content"];
    }
    case "ADD_TAG":
    case "REMOVE_TAG":
      return ["Tag selection"];
    case "WEBHOOK": {
      const url = String(config.url ?? "");
      return [url ? `URL ${truncate(url, 36)}` : "Webhook config"];
    }
    case "DELAY": {
      const t = totalDelayLabel(config);
      return [`Delay ${t}`];
    }
    case "CONDITION":
      return ["Condition kind + sub-fields", "Outgoing true/false branch labels"];
    case "END":
      return [`Exit reason "${truncate(String(config.reason ?? ""), 36)}"`];
    default:
      return ["Current config"];
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// BFS from `startNodeId` over outgoing edges. Returns every node reachable
// downstream — used by the delete cascade to compute the set that will be
// removed alongside the operator's target. The start node itself is NOT in
// the result (callers add it explicitly).
function getDownstreamNodeIds(startNodeId: string, edges: Edge[]): Set<string> {
  const visited = new Set<string>();
  const queue: string[] = [startNodeId];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    for (const e of edges) {
      if (e.source !== curr) continue;
      if (visited.has(e.target)) continue;
      visited.add(e.target);
      queue.push(e.target);
    }
  }
  return visited;
}

function totalDelayLabel(config: Record<string, unknown>): string {
  const d = Number(config.days   ?? 0);
  const h = Number(config.hours  ?? 0);
  const m = Number(config.minutes ?? 0);
  if (d) return `${d}d ${h}h ${m}m`.replace(/ 0[hm]/g, "").trim();
  if (h) return `${h}h ${m}m`.replace(/ 0m/g, "").trim();
  if (m) return `${m} min`;
  return "no delay";
}
