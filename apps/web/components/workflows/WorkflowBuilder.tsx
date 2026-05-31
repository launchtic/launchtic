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
  GitBranch, Split as SplitIcon, Square, Loader2, Save, History, Zap, X,
  Undo2, Redo2, Trash2,
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
  | "DELAY" | "CONDITION" | "SPLIT" | "END";
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
  reEnrollPolicy: string;
  reEnrollCooldownDays: number | null;
  maxDurationDays: number | null;
};

type Props = {
  workflow: Workflow;
  tags:     { id: string; name: string; color: string | null }[];
  senders:  { id: string; name: string; email: string; isDefault: boolean }[];
  funnels:  { id: string; name: string; steps: { id: string; name: string; type: string }[] }[];
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
  CONDITION:  { label: "If / else",     Icon: GitBranch,   color: "#f97316", defaultConfig: { kind: "contact_has_tag" } },
  SPLIT:      { label: "Split (A/B)",   Icon: SplitIcon,   color: "#ec4899", defaultConfig: {} },
  END:        { label: "End",           Icon: Square,      color: "#dc2626", defaultConfig: {} },
};

const TRIGGER_TYPES = [
  "NEW_SALE", "SALE_CANCELED", "SUBSCRIPTION_PAYMENT_FAILED",
  "FORM_SUBMIT", "TAG_ADDED", "TAG_REMOVED", "EMAIL_LINK_CLICKED",
  "CHECKOUT_STARTED",
];

function triggerHumanLabel(t: string): string {
  return t.replace(/_/g, " ").toLowerCase();
}

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
//   • GOAL          → 1 outgoing (continuation path when goal not met;
//                     `true` exits the run, no "true edge" needed)
//   • SPLIT         → unbounded (weighted random routes)
//   • everything    → 1 outgoing (linear chain)
function useCanAddNext(nodeId: string, nodeType: NodeType | "TRIGGER"): boolean {
  return useStore((s) => {
    const outgoingCount = s.edges.reduce((n, e) => e.source === nodeId ? n + 1 : n, 0);
    if (nodeType === "TRIGGER")  return outgoingCount < 1;
    if (nodeType === "END")      return false;
    if (nodeType === "SPLIT")    return true;
    if (nodeType === "CONDITION") return outgoingCount < 2;
    return outgoingCount < 1;
  });
}

function NodeCard({ data, id }: { data: { type: NodeType; label?: string; subtitle?: string }; id: string }) {
  const def = NODE_DEFS[data.type];
  const Icon = def.Icon;
  const { openPicker, deleteNode, issuesByNode } = useBuilder();
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
          doesn't also fire react-flow's onNodeClick. */}
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
      {canAddNext && <NextStepButton onClick={() => openPicker(id)} />}
    </div>
  );
}

function TriggerNodeCard({ data, id }: { data: { triggerType: string; triggerSubtitle: string | null }; id: string }) {
  const { openPicker, issuesByNode } = useBuilder();
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
      {canAddNext && <NextStepButton onClick={() => openPicker(id)} accent="#2563eb" />}
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

function InnerBuilder({ workflow: initial, tags, senders, funnels }: Props) {
  const router  = useRouter();
  const params  = useParams();
  const slug    = params.workspaceSlug as string;
  const toast   = useToast();

  const [name, setName]           = useState(initial.name);
  const [status, setStatus]       = useState<Status>(initial.status);
  const [triggerType, setTriggerType]     = useState<string>(initial.triggerType);
  const [triggerConfig, setTriggerConfig] = useState<Record<string, unknown>>(initial.triggerConfig);
  const [reEnrollPolicy, setReEnrollPolicy] = useState<string>(initial.reEnrollPolicy);
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
          subtitle: nodeSubtitle(n.type, n.config ?? {}, tags),
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
  const lastSaved = useRef<string>("");
  useEffect(() => {
    const snap = JSON.stringify({ name, triggerType, triggerConfig, rfNodes, rfEdges, derivedStartNodeId, reEnrollPolicy, configMap });
    if (snap === lastSaved.current) return;
    const t = setTimeout(async () => {
      lastSaved.current = snap;
      await save();
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, triggerType, triggerConfig, rfNodes, rfEdges, derivedStartNodeId, reEnrollPolicy, configMap]);

  // ─── Persistence ────────────────────────────────────────────────────────
  async function save() {
    setBusy("saving");
    const payload = {
      name,
      triggerConfig,
      startNodeId: derivedStartNodeId,
      reEnrollPolicy,
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
  function addNodeFrom(sourceId: string, type: NodeType) {
    const id  = `n_${Math.random().toString(36).slice(2, 10)}`;
    const def = NODE_DEFS[type];
    const newCfg = { ...def.defaultConfig };

    const sourceNode = rfNodes.find((n) => n.id === sourceId);
    // Position is a placeholder — the structural-change effect below will
    // re-run dagre and reposition every node within the same tick.
    const position = { x: 0, y: 0 };

    setConfigMap((prev) => ({ ...prev, [id]: newCfg }));
    setRfNodes((prev) => prev.concat({
      id, type: "workflowNode", position,
      data: { type, subtitle: nodeSubtitle(type, newCfg, tags) },
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

  // Delete a node (and any edges touching it) by id. Used both by the hover
  // X on the node card and the keyboard Backspace shortcut. Trigger node is
  // protected at the top of the function and via onNodesChangeGuarded.
  const deleteNode = useCallback((nodeId: string) => {
    if (nodeId === TRIGGER_ID) return;
    setRfNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setRfEdges((prev) => prev.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setConfigMap((prev) => { const next = { ...prev }; delete next[nodeId]; return next; });
    setSelectedNodeId((sel) => sel === nodeId ? null : sel);
  }, [setRfNodes, setRfEdges]);

  function deleteSelected() {
    if (selectedNodeId) deleteNode(selectedNodeId);
  }

  // Block deletion of the trigger node via keyboard / programmatic changes.
  const onNodesChangeGuarded = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      const safe = changes.filter((c) => !(c.type === "remove" && c.id === TRIGGER_ID));
      onNodesChange(safe);
    },
    [onNodesChange],
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
  }), [triggerType, triggerConfig, derivedStartNodeId, rfNodes, rfEdges, configMap]);

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
    () => ({ openPicker, deleteNode, issuesByNode }),
    [openPicker, deleteNode, issuesByNode],
  );

  // ─── Undo / Redo ────────────────────────────────────────────────────────
  // Snapshot-based history: every debounced change pushes a deep-clone of the
  // current state onto undoStack and clears redoStack. Ctrl/Cmd+Z restores the
  // previous snapshot; Ctrl/Cmd+Shift+Z (or Ctrl+Y) redoes.
  type Snapshot = {
    rfNodes:       Node[];
    rfEdges:       Edge[];
    configMap:     Record<string, Record<string, unknown>>;
    name:          string;
    triggerType:   string;
    triggerConfig: Record<string, unknown>;
    reEnrollPolicy: string;
  };
  const makeSnapshot = useCallback((): Snapshot => ({
    rfNodes:       JSON.parse(JSON.stringify(rfNodes)),
    rfEdges:       JSON.parse(JSON.stringify(rfEdges)),
    configMap:     JSON.parse(JSON.stringify(configMap)),
    name, triggerType,
    triggerConfig: JSON.parse(JSON.stringify(triggerConfig)),
    reEnrollPolicy,
  }), [rfNodes, rfEdges, configMap, name, triggerType, triggerConfig, reEnrollPolicy]);

  const [undoStack, setUndoStack] = useState<Snapshot[]>(() => [{
    rfNodes:       JSON.parse(JSON.stringify(initialNodes)),
    rfEdges:       JSON.parse(JSON.stringify(initialEdges)),
    configMap:     (() => { const m: Record<string, Record<string, unknown>> = {}; for (const n of initial.nodes) m[n.id] = { ...(n.config ?? {}) }; return m; })(),
    name:          initial.name,
    triggerType:   initial.triggerType,
    triggerConfig: JSON.parse(JSON.stringify(initial.triggerConfig)),
    reEnrollPolicy: initial.reEnrollPolicy,
  }]);
  const [redoStack, setRedoStack] = useState<Snapshot[]>([]);
  const isRestoring = useRef(false);

  // Debounced snapshot push. Skips when the current state equals the top of
  // the undo stack (no real change — e.g. selection-only react-flow updates).
  useEffect(() => {
    if (isRestoring.current) { isRestoring.current = false; return; }
    const t = setTimeout(() => {
      const snap = makeSnapshot();
      const key  = JSON.stringify(snap);
      setUndoStack((u) => {
        const top = u[u.length - 1];
        if (top && JSON.stringify(top) === key) return u; // no-op change
        return [...u.slice(-49), snap];
      });
      setRedoStack([]);
    }, 800);
    return () => clearTimeout(t);
  }, [makeSnapshot]);

  const restoreSnapshot = useCallback((s: Snapshot) => {
    isRestoring.current = true;
    setRfNodes(JSON.parse(JSON.stringify(s.rfNodes)));
    setRfEdges(JSON.parse(JSON.stringify(s.rfEdges)));
    setConfigMap(JSON.parse(JSON.stringify(s.configMap)));
    setName(s.name);
    setTriggerType(s.triggerType);
    setTriggerConfig(JSON.parse(JSON.stringify(s.triggerConfig)));
    setReEnrollPolicy(s.reEnrollPolicy);
  }, [setRfNodes, setRfEdges]);

  const canUndo = undoStack.length > 1;
  const canRedo = redoStack.length > 0;

  const undo = useCallback(() => {
    if (undoStack.length < 2) return;
    const current  = undoStack[undoStack.length - 1];
    const previous = undoStack[undoStack.length - 2];
    setRedoStack((r) => [...r, current]);
    setUndoStack((u) => u.slice(0, -1));
    restoreSnapshot(previous);
  }, [undoStack, restoreSnapshot]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((r) => r.slice(0, -1));
    setUndoStack((u) => [...u, next]);
    restoreSnapshot(next);
  }, [redoStack, restoreSnapshot]);

  // Keyboard: Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z or Ctrl+Y = redo. Skip if
  // focus is in a text input/textarea (those handle their own undo natively).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((e.key === "z" && e.shiftKey) || e.key === "y") { e.preventDefault(); redo(); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [undo, redo]);

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
        data: { ...n.data, subtitle: nodeSubtitle(selectedType!, next[selectedNodeId], tags) },
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
          className="flex-1 text-sm font-semibold text-gray-900 bg-transparent border-none outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1 -ml-1"
        />
        <span className={`text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded ${
          status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" :
          status === "PAUSED" ? "bg-amber-50 text-amber-700" :
          "bg-gray-100 text-gray-600"
        }`}>{status.toLowerCase()}</span>
        {busy === "saving" && <span className="text-xs text-gray-400 flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> saving…</span>}
        {/* Undo / Redo. Disabled state mirrors stack emptiness. Ctrl/Cmd+Z and
            Ctrl/Cmd+Shift+Z (or Ctrl+Y) also work via the document key listener. */}
        <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={undo}
            disabled={!canUndo}
            title="Undo (Ctrl/Cmd+Z)"
            className="p-1.5 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <Undo2 size={13} />
          </button>
          <div className="w-px h-4 bg-gray-200" />
          <button
            onClick={redo}
            disabled={!canRedo}
            title="Redo (Ctrl/Cmd+Shift+Z)"
            className="p-1.5 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <Redo2 size={13} />
          </button>
        </div>
        <button
          onClick={() => setShowHistory(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
        >
          <History size={13} /> Runs
        </button>
        <button
          onClick={() => save()}
          disabled={!!busy}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 rounded-lg disabled:opacity-50"
        >
          {busy === "saving" ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          Save
        </button>
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

          {/* Floating re-enroll selector (bottom-left of canvas) */}
          <div className="absolute bottom-3 left-3 bg-white border border-gray-200 rounded-lg shadow-sm px-2 py-1.5 flex items-center gap-2 z-10">
            <span className="text-[10px] uppercase font-semibold tracking-wider text-gray-400">Re-enroll</span>
            <select
              value={reEnrollPolicy}
              onChange={(e) => setReEnrollPolicy(e.target.value)}
              className="text-xs border-none outline-none bg-transparent text-gray-700 focus:ring-0 cursor-pointer"
            >
              <option value="SINGLE_ACTIVE">Single active</option>
              <option value="ALWAYS">Always</option>
              <option value="COOLDOWN">Cooldown</option>
            </select>
          </div>
        </div>

        {/* Right properties panel */}
        {selectedNodeId === TRIGGER_ID && (
          <div className="w-72 border-l border-gray-200 bg-white p-3 overflow-y-auto shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Zap size={14} className="text-blue-600" />
                Trigger
              </h3>
            </div>
            <TriggerConfigForm
              triggerType={triggerType}
              triggerConfig={triggerConfig}
              funnels={funnels}
              onTypeChange={setTriggerType}
              onConfigChange={setTriggerConfig}
            />
          </div>
        )}
        {selectedNode && selectedNodeId !== TRIGGER_ID && selectedType && (
          <div className="w-72 border-l border-gray-200 bg-white p-3 overflow-y-auto shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                {(() => { const I = NODE_DEFS[selectedType].Icon; return <I size={14} />; })()}
                {NODE_DEFS[selectedType].label}
              </h3>
              <div className="flex gap-1">
                <button onClick={deleteSelected} className="p-1 text-red-500 hover:bg-red-50 rounded" title="Delete">×</button>
              </div>
            </div>
            <NodeConfigForm type={selectedType} config={selectedConfig} onChange={patchConfig} tags={tags} senders={senders} />
          </div>
        )}
      </div>

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
  // Hint copy per type — kept short so the grid stays scannable.
  const HINTS: Record<NodeType, string> = {
    SEND_EMAIL: "Personalised email with Mustache vars",
    ADD_TAG:    "Tag the contact",
    REMOVE_TAG: "Remove a tag from the contact",
    WEBHOOK:    "Call any HTTP endpoint (Slack, CRM, custom)",
    DELAY:      "Wait minutes / hours / days before next step",
    CONDITION:  "Rẽ nhánh true / false (use true → End for early exit)",
    SPLIT:      "A/B split by weighted random",
    END:        "Mark this branch completed",
  };

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
                  <div className="text-[11px] text-gray-500 leading-snug">{HINTS[t]}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
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

// ─── Trigger config form (right panel when trigger node selected) ──────────

function TriggerConfigForm({
  triggerType, triggerConfig, funnels, onTypeChange, onConfigChange,
}: {
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  funnels: Props["funnels"];
  onTypeChange: (t: string) => void;
  onConfigChange: (c: Record<string, unknown>) => void;
}) {
  const inp = "w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500";
  const lbl = "block text-[11px] uppercase font-semibold tracking-wider text-gray-500 mb-1";
  const funnelId = (triggerConfig.funnelId as string | undefined) ?? "";
  const funnel = funnels.find((f) => f.id === funnelId);
  return (
    <div className="space-y-3">
      <div>
        <label className={lbl}>When</label>
        <select className={inp} value={triggerType} onChange={(e) => onTypeChange(e.target.value)}>
          {TRIGGER_TYPES.map((t) => <option key={t} value={t}>{triggerHumanLabel(t)}</option>)}
        </select>
      </div>
      <div>
        <label className={lbl}>Funnel filter</label>
        <select
          className={inp}
          value={funnelId}
          onChange={(e) => onConfigChange({ ...triggerConfig, funnelId: e.target.value || undefined, funnelStepId: undefined })}
        >
          <option value="">— any funnel —</option>
          {funnels.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </div>
      {funnel && (
        <div>
          <label className={lbl}>Step filter</label>
          <select
            className={inp}
            value={(triggerConfig.funnelStepId as string | undefined) ?? ""}
            onChange={(e) => onConfigChange({ ...triggerConfig, funnelStepId: e.target.value || undefined })}
          >
            <option value="">— any step —</option>
            {funnel.steps.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.type})</option>)}
          </select>
        </div>
      )}
      <p className="text-[10px] text-gray-400 leading-snug">
        Only events matching this trigger type + filter will start a run for this workflow.
      </p>
    </div>
  );
}

// ─── Per-node-type config form ─────────────────────────────────────────────

function NodeConfigForm({
  type, config, onChange, tags, senders,
}: {
  type: NodeType;
  config: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
  tags: Props["tags"];
  senders: Props["senders"];
}) {
  const inp  = "w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500";
  const lbl  = "block text-[11px] uppercase font-semibold tracking-wider text-gray-500 mb-1";

  if (type === "SEND_EMAIL") {
    const senderId = (config.senderId as string | undefined) ?? "";
    return (
      <div className="space-y-3">
        <div>
          <label className={lbl}>From</label>
          <select className={inp} value={senderId} onChange={(e) => {
            const id = e.target.value;
            const s  = senders.find((x) => x.id === id);
            onChange({ senderId: id, fromName: s?.name, fromEmail: s?.email });
          }}>
            <option value="">— pick sender —</option>
            {senders.map((s) => <option key={s.id} value={s.id}>{s.name} &lt;{s.email}&gt;</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Subject</label>
          <input className={inp} value={(config.subject as string) ?? ""} onChange={(e) => onChange({ subject: e.target.value })} placeholder="Hi {{contact.firstName}}…" />
        </div>
        <div>
          <label className={lbl}>HTML body</label>
          <textarea
            className={`${inp} font-mono`} rows={8}
            value={(config.bodyHtml as string) ?? ""}
            onChange={(e) => onChange({ bodyHtml: e.target.value })}
            placeholder="<p>Hello {{contact.firstName}},</p>…"
          />
          <p className="text-[10px] text-gray-400 mt-1">Mustache vars: contact, workspace, trigger data.</p>
        </div>
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
      <div className="space-y-3">
        <div>
          <label className={lbl}>URL</label>
          <input className={inp} value={(config.url as string) ?? ""} onChange={(e) => onChange({ url: e.target.value })} placeholder="https://…" />
        </div>
        <div>
          <label className={lbl}>Method</label>
          <select className={inp} value={(config.method as string) ?? "POST"} onChange={(e) => onChange({ method: e.target.value })}>
            <option>POST</option><option>GET</option><option>PUT</option><option>PATCH</option>
          </select>
        </div>
      </div>
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
    const kind = (config.kind as string) ?? "contact_has_tag";
    return (
      <div className="space-y-3">
        <div>
          <label className={lbl}>Kind</label>
          <select className={inp} value={kind} onChange={(e) => onChange({ kind: e.target.value })}>
            <option value="contact_has_tag">Contact has tag</option>
            <option value="contact_completed_purchase">Contact completed purchase</option>
            <option value="contact_field">Contact field</option>
            <option value="trigger_amount">Trigger amount</option>
            <option value="trigger_funnel">Trigger funnel</option>
          </select>
        </div>
        {kind === "contact_has_tag" && (
          <div>
            <label className={lbl}>Tag</label>
            <select className={inp} value={(config.tagId as string) ?? ""} onChange={(e) => onChange({ tagId: e.target.value })}>
              <option value="">— pick tag —</option>
              {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
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
        {kind === "trigger_amount" && <CompareFields config={config} onChange={onChange} numericOnly />}
        {kind === "trigger_funnel" && (
          <input className={inp} placeholder="funnelId" value={(config.funnelId as string) ?? ""} onChange={(e) => onChange({ funnelId: e.target.value })} />
        )}
        <p className="text-[10px] text-gray-500">Connect two outgoing edges — they'll be labeled <b>true</b> and <b>false</b> automatically. For "exit when goal met" patterns, wire the <b>true</b> branch to an End node.</p>
      </div>
    );
  }

  if (type === "SPLIT") {
    return <p className="text-xs text-gray-500">Connect multiple outgoing edges. Pick by random weight (each edge weight defaults to 1).</p>;
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

function CompareFields({ config, onChange, numericOnly }: { config: Record<string, unknown>; onChange: (p: Record<string, unknown>) => void; numericOnly?: boolean }) {
  const inp = "w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500";
  const lbl = "block text-[11px] uppercase font-semibold tracking-wider text-gray-500 mb-1";
  return (
    <>
      <div>
        <label className={lbl}>Operator</label>
        <select className={inp} value={(config.operator as string) ?? "eq"} onChange={(e) => onChange({ operator: e.target.value })}>
          <option value="eq">equals</option>
          <option value="neq">not equals</option>
          <option value="gt">greater than</option>
          <option value="gte">≥</option>
          <option value="lt">less than</option>
          <option value="lte">≤</option>
          {!numericOnly && <option value="contains">contains</option>}
          {!numericOnly && <option value="empty">is empty</option>}
          {!numericOnly && <option value="not_empty">not empty</option>}
        </select>
      </div>
      <div>
        <label className={lbl}>Value</label>
        <input
          type={numericOnly ? "number" : "text"}
          className={inp}
          value={(config.value as string | number) ?? ""}
          onChange={(e) => onChange({ value: numericOnly ? Number(e.target.value) : e.target.value })}
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

function nodeSubtitle(type: NodeType, config: Record<string, unknown>, tags: Props["tags"]): string | undefined {
  if (type === "SEND_EMAIL") return (config.subject as string) || undefined;
  if (type === "ADD_TAG" || type === "REMOVE_TAG") {
    const id = config.tagId as string | undefined;
    const tag = tags.find((t) => t.id === id);
    return tag?.name;
  }
  if (type === "WEBHOOK") return (config.url as string) || undefined;
  if (type === "DELAY")   return totalDelayLabel(config);
  if (type === "CONDITION") return (config.kind as string) || undefined;
  return undefined;
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

function totalDelayLabel(config: Record<string, unknown>): string {
  const d = Number(config.days   ?? 0);
  const h = Number(config.hours  ?? 0);
  const m = Number(config.minutes ?? 0);
  if (d) return `${d}d ${h}h ${m}m`.replace(/ 0[hm]/g, "").trim();
  if (h) return `${h}h ${m}m`.replace(/ 0m/g, "").trim();
  if (m) return `${m} min`;
  return "no delay";
}
