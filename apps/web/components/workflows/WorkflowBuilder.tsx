"use client";

// Visual workflow builder — react-flow canvas + node palette + properties panel.
// Auto-saves debounced; explicit Activate transitions DRAFT→ACTIVE via the
// status endpoint (which validates the graph server-side too).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ReactFlow, Background, Controls, MiniMap, ReactFlowProvider,
  useNodesState, useEdgesState, addEdge, type Edge, type Node, type Connection, MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft, Plus, Play, Pause, Mail, Tag, TagIcon as TagOff, Globe, Clock,
  GitBranch, Split as SplitIcon, Target, Square, Loader2, Save, History, Star,
} from "lucide-react";
import { useToast } from "../ui/Toast";
import { apiFetch } from "../../lib/api-client";
import WorkflowRunHistory from "./WorkflowRunHistory";

// ─── Types ──────────────────────────────────────────────────────────────────

type NodeType =
  | "SEND_EMAIL" | "ADD_TAG" | "REMOVE_TAG" | "WEBHOOK"
  | "DELAY" | "CONDITION" | "SPLIT" | "GOAL" | "END";
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

// ─── Node metadata ──────────────────────────────────────────────────────────

const NODE_DEFS: Record<NodeType, { label: string; Icon: typeof Mail; color: string; defaultConfig: Record<string, unknown> }> = {
  SEND_EMAIL: { label: "Send email",    Icon: Mail,        color: "#3b82f6", defaultConfig: { subject: "", bodyHtml: "" } },
  ADD_TAG:    { label: "Add tag",       Icon: Tag,         color: "#10b981", defaultConfig: { tagId: "" } },
  REMOVE_TAG: { label: "Remove tag",    Icon: TagOff,      color: "#f59e0b", defaultConfig: { tagId: "" } },
  WEBHOOK:    { label: "Webhook",       Icon: Globe,       color: "#8b5cf6", defaultConfig: { url: "", method: "POST" } },
  DELAY:      { label: "Wait",          Icon: Clock,       color: "#6b7280", defaultConfig: { hours: 1 } },
  CONDITION:  { label: "If / else",     Icon: GitBranch,   color: "#f97316", defaultConfig: { kind: "contact_has_tag" } },
  SPLIT:      { label: "Split (A/B)",   Icon: SplitIcon,   color: "#ec4899", defaultConfig: {} },
  GOAL:       { label: "Goal",          Icon: Target,      color: "#059669", defaultConfig: { kind: "contact_has_tag" } },
  END:        { label: "End",           Icon: Square,      color: "#dc2626", defaultConfig: {} },
};

const TRIGGER_TYPES = [
  "NEW_SALE", "SALE_CANCELED", "SUBSCRIPTION_PAYMENT_FAILED",
  "FORM_SUBMIT", "TAG_ADDED", "TAG_REMOVED", "EMAIL_LINK_CLICKED",
];

// ─── Custom node renderer ──────────────────────────────────────────────────
// Compact card with icon + label. CONDITION nodes get visual marker for the
// true/false branches so designers see at a glance which way is which.

function NodeCard({ data }: { data: { type: NodeType; label?: string; isStart: boolean; subtitle?: string } }) {
  const def = NODE_DEFS[data.type];
  const Icon = def.Icon;
  return (
    <div
      style={{
        background: "white",
        borderRadius: 10,
        border: `1.5px solid ${data.isStart ? "#2563eb" : "#e5e7eb"}`,
        boxShadow: data.isStart ? "0 0 0 3px rgba(37, 99, 235, 0.12)" : "0 1px 2px rgba(0,0,0,0.04)",
        padding: "10px 12px",
        minWidth: 170,
        position: "relative",
      }}
    >
      {data.isStart && (
        <div style={{ position: "absolute", top: -8, right: -8, background: "#2563eb", color: "white", borderRadius: 999, padding: "1px 6px", fontSize: 9, fontWeight: 600, display: "flex", alignItems: "center", gap: 2 }}>
          <Star size={9} fill="white" /> START
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: data.subtitle ? 2 : 0 }}>
        <div style={{ width: 22, height: 22, borderRadius: 6, background: `${def.color}15`, display: "flex", alignItems: "center", justifyContent: "center", color: def.color, flexShrink: 0 }}>
          <Icon size={13} />
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{data.label ?? def.label}</div>
      </div>
      {data.subtitle && <div style={{ fontSize: 11, color: "#6b7280", marginLeft: 30 }}>{data.subtitle}</div>}
    </div>
  );
}

const nodeTypes = { workflowNode: NodeCard };

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
  const [startNodeId, setStartNodeId]     = useState<string | null>(initial.startNodeId);
  const [reEnrollPolicy, setReEnrollPolicy] = useState<string>(initial.reEnrollPolicy);
  const [showHistory, setShowHistory] = useState(false);

  // The full canonical config map keyed by node id — keeps node.config out
  // of the react-flow internal state (rf re-renders on every drag).
  const [configMap, setConfigMap] = useState<Record<string, Record<string, unknown>>>(() => {
    const m: Record<string, Record<string, unknown>> = {};
    for (const n of initial.nodes) m[n.id] = { ...(n.config ?? {}) };
    return m;
  });

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node>(
    initial.nodes.map((n) => ({
      id: n.id,
      type: "workflowNode",
      position: n.position ?? { x: 100, y: 100 },
      data: {
        type: n.type,
        isStart: n.id === initial.startNodeId,
        subtitle: nodeSubtitle(n.type, n.config ?? {}, tags),
      },
    })) as Node[],
  );
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>(
    initial.edges.map((e) => edgeToRf(e)) as Edge[],
  );

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [busy, setBusy] = useState<"saving" | "activating" | null>(null);

  // ─── Auto-save (debounced) ──────────────────────────────────────────────
  const lastSaved = useRef<string>("");
  useEffect(() => {
    const snap = JSON.stringify({ name, triggerType, triggerConfig, rfNodes, rfEdges, startNodeId, reEnrollPolicy, configMap });
    if (snap === lastSaved.current) return;
    const t = setTimeout(async () => {
      lastSaved.current = snap;
      await save();
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, triggerType, triggerConfig, rfNodes, rfEdges, startNodeId, reEnrollPolicy, configMap]);

  // ─── Persistence ────────────────────────────────────────────────────────
  async function save() {
    setBusy("saving");
    const payload = {
      name,
      triggerConfig,
      startNodeId,
      reEnrollPolicy,
      nodes: rfNodes.map((n) => ({
        id: n.id,
        type: (n.data as any).type as NodeType,
        position: n.position,
        config: configMap[n.id] ?? {},
      })),
      edges: rfEdges.map((e) => ({
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
    setBusy("activating");
    const res = await apiFetch(`/api/workflows/${initial.id}/status`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: status === "ACTIVE" ? "PAUSED" : "ACTIVE" }),
    });
    const json = await res.json();
    setBusy(null);
    if (!json.success) { toast.error(json.error ?? "Activation failed"); return; }
    setStatus(json.data.status);
  }

  // ─── Graph mutations ────────────────────────────────────────────────────
  function addNode(type: NodeType) {
    const id = `n_${Math.random().toString(36).slice(2, 10)}`;
    const def = NODE_DEFS[type];
    const newCfg = { ...def.defaultConfig };
    setConfigMap((prev) => ({ ...prev, [id]: newCfg }));
    setRfNodes((prev) => prev.concat({
      id,
      type: "workflowNode",
      position: { x: 200 + Math.random() * 200, y: 200 + Math.random() * 200 },
      data: { type, isStart: false, subtitle: nodeSubtitle(type, newCfg, tags) },
    }));
    // First-node convenience: auto-mark as start.
    if (rfNodes.length === 0) setStartNodeId(id);
  }

  function deleteSelected() {
    if (!selectedNodeId) return;
    setRfNodes((prev) => prev.filter((n) => n.id !== selectedNodeId));
    setRfEdges((prev) => prev.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setConfigMap((prev) => { const next = { ...prev }; delete next[selectedNodeId]; return next; });
    if (startNodeId === selectedNodeId) setStartNodeId(null);
    setSelectedNodeId(null);
  }

  function setAsStart(id: string) {
    setStartNodeId(id);
    setRfNodes((prev) => prev.map((n) => ({ ...n, data: { ...n.data, isStart: n.id === id } })));
  }

  const onConnect = useCallback(
    (conn: Connection) => {
      const sourceNode = rfNodes.find((n) => n.id === conn.source);
      const sourceType = (sourceNode?.data as any)?.type as NodeType | undefined;
      // CONDITION + GOAL fan out via labeled edges. SPLIT uses labeled edges
      // for weighted random. Default label for sane wiring.
      let label: string | undefined;
      if (sourceType === "CONDITION" || sourceType === "GOAL") {
        const existing = rfEdges.filter((e) => e.source === conn.source);
        label = existing.some((e) => e.label === "true") ? "false" : "true";
      }
      const id = `e_${Math.random().toString(36).slice(2, 10)}`;
      setRfEdges((prev) => addEdge({
        ...conn,
        id,
        label,
        type: "smoothstep",
        animated: false,
        markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
        style: { stroke: "#94a3b8", strokeWidth: 1.5 },
        labelStyle: { fontSize: 11, fontWeight: 600, fill: label === "true" ? "#059669" : label === "false" ? "#dc2626" : "#64748b" },
        labelBgStyle: { fill: "white" },
      } as Edge, prev));
    },
    [rfNodes, rfEdges, setRfEdges],
  );

  // ─── Selected node config ───────────────────────────────────────────────
  const selectedNode  = useMemo(() => rfNodes.find((n) => n.id === selectedNodeId), [rfNodes, selectedNodeId]);
  const selectedType  = (selectedNode?.data as any)?.type as NodeType | undefined;
  const selectedConfig = selectedNodeId ? (configMap[selectedNodeId] ?? {}) : {};

  function patchConfig(patch: Record<string, unknown>) {
    if (!selectedNodeId) return;
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
  const triggerFunnelId = (triggerConfig.funnelId as string | undefined) ?? "";
  const triggerFunnel   = funnels.find((f) => f.id === triggerFunnelId);

  return (
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
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Left palette */}
        <div className="w-56 border-r border-gray-200 bg-white p-3 overflow-y-auto shrink-0">
          <h3 className="text-[11px] uppercase font-semibold tracking-wider text-gray-400 mb-2 px-1">Trigger</h3>
          <select
            value={triggerType}
            onChange={(e) => setTriggerType(e.target.value)}
            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {TRIGGER_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ").toLowerCase()}</option>)}
          </select>
          <select
            value={triggerFunnelId}
            onChange={(e) => setTriggerConfig({ ...triggerConfig, funnelId: e.target.value || undefined, funnelStepId: undefined })}
            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">— any funnel —</option>
            {funnels.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          {triggerFunnel && (
            <select
              value={(triggerConfig.funnelStepId as string | undefined) ?? ""}
              onChange={(e) => setTriggerConfig({ ...triggerConfig, funnelStepId: e.target.value || undefined })}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— any step —</option>
              {triggerFunnel.steps.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.type})</option>)}
            </select>
          )}

          <h3 className="text-[11px] uppercase font-semibold tracking-wider text-gray-400 mb-2 mt-4 px-1">Nodes</h3>
          <div className="space-y-1">
            {(Object.keys(NODE_DEFS) as NodeType[]).map((t) => {
              const def = NODE_DEFS[t];
              const Icon = def.Icon;
              return (
                <button
                  key={t}
                  onClick={() => addNode(t)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50 rounded-lg text-left"
                >
                  <div style={{ width: 22, height: 22, borderRadius: 6, background: `${def.color}15`, color: def.color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon size={12} />
                  </div>
                  <span>{def.label}</span>
                  <Plus size={11} className="ml-auto text-gray-300" />
                </button>
              );
            })}
          </div>

          <h3 className="text-[11px] uppercase font-semibold tracking-wider text-gray-400 mb-2 mt-4 px-1">Re-enroll</h3>
          <select
            value={reEnrollPolicy}
            onChange={(e) => setReEnrollPolicy(e.target.value)}
            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="SINGLE_ACTIVE">Single active</option>
            <option value="ALWAYS">Always re-enroll</option>
            <option value="COOLDOWN">Cooldown (days)</option>
          </select>
        </div>

        {/* Canvas */}
        <div className="flex-1 relative bg-[#fafafa]">
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
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

          {rfNodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center text-gray-400 text-sm">
                <p>Click a node on the left to add it</p>
                <p className="text-xs mt-1">Drag from a node's edge to connect to another</p>
              </div>
            </div>
          )}
        </div>

        {/* Right properties panel */}
        {selectedNode && selectedType && (
          <div className="w-72 border-l border-gray-200 bg-white p-3 overflow-y-auto shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                {(() => { const I = NODE_DEFS[selectedType].Icon; return <I size={14} />; })()}
                {NODE_DEFS[selectedType].label}
              </h3>
              <div className="flex gap-1">
                {selectedNodeId !== startNodeId && (
                  <button onClick={() => setAsStart(selectedNodeId!)} className="p-1 text-blue-500 hover:bg-blue-50 rounded" title="Mark as start">
                    <Star size={13} />
                  </button>
                )}
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
    const sender = senders.find((s) => s.id === senderId) ?? senders.find((s) => s.isDefault) ?? senders[0];
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

  if (type === "CONDITION" || type === "GOAL") {
    const kind = (config.kind as string) ?? "contact_has_tag";
    return (
      <div className="space-y-3">
        <div>
          <label className={lbl}>Kind</label>
          <select className={inp} value={kind} onChange={(e) => onChange({ kind: e.target.value })}>
            <option value="contact_has_tag">Contact has tag</option>
            <option value="contact_field">Contact field</option>
            <option value="trigger_amount">Trigger amount</option>
            <option value="trigger_funnel">Trigger funnel</option>
            <option value="context_key">Context key</option>
            <option value="always_true">Always true</option>
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
        {kind === "context_key" && (
          <>
            <div>
              <label className={lbl}>Key</label>
              <input className={inp} value={(config.key as string) ?? ""} onChange={(e) => onChange({ key: e.target.value })} />
            </div>
            <CompareFields config={config} onChange={onChange} />
          </>
        )}
        {type === "CONDITION" && <p className="text-[10px] text-gray-500">Connect two outgoing edges labeled <b>true</b> and <b>false</b>.</p>}
        {type === "GOAL" && <p className="text-[10px] text-gray-500">If goal evaluates true, the run exits immediately.</p>}
      </div>
    );
  }

  if (type === "SPLIT") {
    return <p className="text-xs text-gray-500">Connect multiple outgoing edges. Pick by random weight (each edge weight defaults to 1).</p>;
  }

  if (type === "END") {
    return <p className="text-xs text-gray-500">Terminates this branch. The run is marked COMPLETED.</p>;
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
  return {
    id: e.id, source: e.source, target: e.target,
    label: e.label,
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
    style: { stroke: "#94a3b8", strokeWidth: 1.5 },
    labelStyle: { fontSize: 11, fontWeight: 600, fill: e.label === "true" ? "#059669" : e.label === "false" ? "#dc2626" : "#64748b" },
    labelBgStyle: { fill: "white" },
    data: { weight: e.weight },
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
  if (type === "CONDITION" || type === "GOAL") return (config.kind as string) || undefined;
  return undefined;
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
