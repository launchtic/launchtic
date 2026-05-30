"use client";

// Modal: timeline of recent runs for a workflow + the per-step trail so
// operators can debug failures (which node failed + error text).

import { useEffect, useState } from "react";
import { X, CheckCircle, Circle, AlertCircle, Clock, Loader2 } from "lucide-react";
import { apiFetch } from "../../lib/api-client";

type Step = {
  id: string;
  nodeId: string;
  nodeType: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
};

type Run = {
  id: string;
  status: string;
  currentNodeId: string | null;
  scheduledFor: string | null;
  exitReason: string | null;
  startedAt: string;
  completedAt: string | null;
  contact: { id: string; email: string; firstName: string | null; lastName: string | null } | null;
  steps: Step[];
};

const STATUS_DOT: Record<string, { color: string; Icon: typeof CheckCircle }> = {
  ACTIVE:    { color: "#3b82f6", Icon: Clock        },
  COMPLETED: { color: "#10b981", Icon: CheckCircle  },
  EXITED:    { color: "#6b7280", Icon: Circle       },
  FAILED:    { color: "#dc2626", Icon: AlertCircle  },
};

export default function WorkflowRunHistory({ workflowId, onClose }: { workflowId: string; onClose: () => void }) {
  const [runs, setRuns]       = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res  = await apiFetch(`/api/workflows/${workflowId}/runs`);
      const json = await res.json();
      if (json.success) setRuns(json.data.items);
      setLoading(false);
    })();
  }, [workflowId]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Run history</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:bg-gray-100 rounded"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center py-12 text-gray-400 text-sm flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : runs.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">No runs yet. They show up here when this workflow fires.</div>
          ) : (
            <div className="space-y-2">
              {runs.map((r) => {
                const cfg = STATUS_DOT[r.status] ?? STATUS_DOT.ACTIVE;
                const Icon = cfg.Icon;
                const isOpen = expanded.has(r.id);
                const contactLabel = r.contact ? ([r.contact.firstName, r.contact.lastName].filter(Boolean).join(" ") || r.contact.email) : "—";
                return (
                  <div key={r.id} className="border border-gray-100 rounded-xl">
                    <button onClick={() => toggle(r.id)} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 text-left">
                      <Icon size={14} color={cfg.color} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-gray-600">#{r.id.slice(-8).toUpperCase()}</span>
                          <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded" style={{ background: `${cfg.color}15`, color: cfg.color }}>
                            {r.status.toLowerCase()}
                          </span>
                          {r.exitReason && <span className="text-[10px] text-gray-400">({r.exitReason})</span>}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {contactLabel} · {r.steps.length} step{r.steps.length !== 1 ? "s" : ""} · {new Date(r.startedAt).toLocaleString()}
                        </p>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-1.5">
                        {r.steps.length === 0
                          ? <p className="text-xs text-gray-400">No steps recorded yet.</p>
                          : r.steps.map((s) => {
                              const sCfg = s.status === "COMPLETED" ? STATUS_DOT.COMPLETED
                                         : s.status === "FAILED"    ? STATUS_DOT.FAILED
                                         : STATUS_DOT.ACTIVE;
                              const SI = sCfg.Icon;
                              return (
                                <div key={s.id} className="flex items-start gap-2.5 py-1">
                                  <SI size={12} color={sCfg.color} className="mt-0.5 shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-gray-700">
                                      {s.nodeType} <span className="text-gray-400 font-mono">#{s.nodeId.slice(-6)}</span>
                                    </p>
                                    {s.error && <p className="text-[11px] text-red-600 mt-0.5">{s.error}</p>}
                                  </div>
                                  <span className="text-[10px] text-gray-400 shrink-0">{new Date(s.startedAt).toLocaleTimeString()}</span>
                                </div>
                              );
                            })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
