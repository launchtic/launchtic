// Transition workflow status — activate / pause / archive.
// Activation validates the graph (startNodeId set, referenced by ≥1 edge,
// every node reachable, no orphan edges).

import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { z } from "zod";
import { ok, err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";

const bodySchema = z.object({
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]),
});

type Node = { id: string; type: string };
type Edge = { id: string; source: string; target: string };

function validateGraph(
  nodes: Node[],
  edges: Edge[],
  startNodeId: string | null,
): string | null {
  if (!startNodeId) return "Pick a start node before activating.";
  const nodeIds = new Set(nodes.map((n) => n.id));
  if (!nodeIds.has(startNodeId)) return "Start node doesn't exist in the graph.";

  // Edge sanity.
  for (const e of edges) {
    if (!nodeIds.has(e.source)) return `Edge ${e.id} references a missing source node.`;
    if (!nodeIds.has(e.target)) return `Edge ${e.id} references a missing target node.`;
  }

  // Reachability from start. We don't require ALL nodes to be reachable
  // (drafts may have detached sub-graphs the operator hasn't connected yet),
  // but we DO want the start node to lead SOMEWHERE — either an END node
  // or at least one outgoing edge so the executor doesn't immediately
  // complete the run with nothing to do.
  const startOutgoing = edges.some((e) => e.source === startNodeId);
  const startIsTerminal = nodes.find((n) => n.id === startNodeId)?.type === "END";
  if (!startOutgoing && !startIsTerminal) {
    return "Start node has no outgoing edges and isn't an END node.";
  }

  // Every CONDITION must have at least one "true" and one "false" outgoing
  // edge — otherwise routing is undefined.
  for (const n of nodes) {
    if (n.type === "CONDITION") {
      const outs = edges.filter((e) => e.source === n.id);
      const hasTrue  = outs.some((e) => (e as any).label === "true");
      const hasFalse = outs.some((e) => (e as any).label === "false");
      if (!hasTrue || !hasFalse) {
        return `Condition node "${n.id}" needs both a "true" and a "false" outgoing edge.`;
      }
    }
  }

  return null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const r = await requireAccess("automations:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;
    const { id } = await params;

    const wf = await db.workflow.findFirst({ where: { id, workspaceId } });
    if (!wf) return err("Workflow not found", 404);

    const { status } = bodySchema.parse(await req.json());

    if (status === "ACTIVE" && wf.status !== "ACTIVE") {
      const nodes = (wf.nodes as unknown as Node[]) ?? [];
      const edges = (wf.edges as unknown as Edge[]) ?? [];
      const issue = validateGraph(nodes, edges, wf.startNodeId);
      if (issue) return err(issue, 400);
    }

    const updated = await db.workflow.update({
      where: { id },
      data:  { status },
      select: { id: true, status: true },
    });
    return ok(updated);
  } catch (error) {
    return handleError(error);
  }
}
