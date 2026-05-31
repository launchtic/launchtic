// Transition workflow status — activate / pause / archive.
// Activation runs the same validator the client builder uses (per-node fields
// + graph structure + trigger config). On failure, returns the full list of
// issues so the client can re-render its pre-flight panel.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@launchtic/database";
import { z } from "zod";
import { ok, err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";
import {
  validateWorkflow,
  type WorkflowNode,
  type WorkflowEdge,
} from "../../../../../lib/workflow-validation";

const bodySchema = z.object({
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]),
});

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
      const issues = validateWorkflow({
        triggerType:   wf.triggerType,
        triggerConfig: (wf.triggerConfig as unknown as Record<string, unknown>) ?? {},
        nodes:         (wf.nodes as unknown as WorkflowNode[]) ?? [],
        edges:         (wf.edges as unknown as WorkflowEdge[]) ?? [],
        startNodeId:   wf.startNodeId,
      });
      if (issues.length) {
        return NextResponse.json(
          { success: false, error: "Workflow has validation issues.", issues },
          { status: 400 },
        );
      }
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
