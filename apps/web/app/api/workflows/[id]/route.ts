import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { z } from "zod";
import { ok, err, handleError } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";

const NODE_TYPES = ["SEND_EMAIL", "ADD_TAG", "REMOVE_TAG", "WEBHOOK", "DELAY", "CONDITION", "END"] as const;

const nodeSchema = z.object({
  id:       z.string().min(1),
  type:     z.enum(NODE_TYPES),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  config:   z.record(z.string(), z.any()).default({}),
});

const edgeSchema = z.object({
  id:     z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  label:  z.string().optional(),
  weight: z.number().optional(),
});

// Partial update — only provided fields are written. Same shape as create but
// every field is optional.
const updateSchema = z.object({
  name:                 z.string().min(1).max(200).optional(),
  description:          z.string().max(2000).nullable().optional(),
  triggerType:          z.string().optional(),
  triggerConfig:        z.record(z.string(), z.any()).optional(),
  nodes:                z.array(nodeSchema).optional(),
  edges:                z.array(edgeSchema).optional(),
  startNodeId:          z.string().nullable().optional(),
  reFirePolicy:         z.enum(["every", "once"]).optional(),
  maxDurationDays:      z.number().int().positive().nullable().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const r = await requireAccess("automations:read");
    if (!r.ok) return r.response;
    const { workspaceId } = r;
    const { id } = await params;

    const wf = await db.workflow.findFirst({
      where: { id, workspaceId },
    });
    if (!wf) return err("Workflow not found", 404);

    return ok(wf);
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const r = await requireAccess("automations:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;
    const { id } = await params;

    const existing = await db.workflow.findFirst({ where: { id, workspaceId } });
    if (!existing) return err("Workflow not found", 404);

    // Klaviyo-style strict lock: an ACTIVE workflow is immutable. The
    // operator must Pause it first via the /status endpoint, edit, then
    // re-Activate (which re-runs validation). This prevents in-flight runs
    // from racing against config changes — running enrollments keep
    // executing the graph they enrolled into.
    if (existing.status === "ACTIVE") {
      return err("Workflow is active — pause it to edit.", 409);
    }

    const patch = updateSchema.parse(await req.json());

    const updated = await db.workflow.update({
      where: { id },
      data:  patch as any,
    });
    return ok(updated);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const r = await requireAccess("automations:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;
    const { id } = await params;

    const existing = await db.workflow.findFirst({ where: { id, workspaceId } });
    if (!existing) return err("Workflow not found", 404);

    // Cascade deletes WorkflowRun + WorkflowRunStep via FK ON DELETE CASCADE.
    await db.workflow.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
