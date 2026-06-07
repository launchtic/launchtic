// Workflow CRUD — graph-based automation (Phase 1 refactor).
//
// Coexists with /api/automations during the migration period. Visual builder
// in Phase 1B will use this exclusively; legacy endpoints retire in Phase 1C.

import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { z } from "zod";
import { ok, handleError } from "../../../lib/api";
import { requireAccess } from "../../../lib/permissions";
import { defaultReFirePolicy } from "../../../lib/workflow-validation";

// Same trigger taxonomy as legacy automations for v1 compat. New trigger
// types (CHECKOUT_STARTED, PAGE_VISITED, etc.) land in Phase 2 — the column
// is plain string so adding them is data-only.
const TRIGGER_TYPES = [
  "NEW_SALE",
  "SALE_CANCELED",
  "SUBSCRIPTION_PAYMENT_FAILED",
  "FORM_SUBMIT",
  "TAG_ADDED",
  "TAG_REMOVED",
  "EMAIL_OPENED",
  "EMAIL_LINK_CLICKED",
  "CHECKOUT_STARTED",
] as const;
const STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"] as const;
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

const createSchema = z.object({
  name:                 z.string().min(1).max(200),
  description:          z.string().max(2000).optional(),
  triggerType:          z.enum(TRIGGER_TYPES),
  triggerConfig:        z.record(z.string(), z.any()).default({}),
  nodes:                z.array(nodeSchema).default([]),
  edges:                z.array(edgeSchema).default([]),
  startNodeId:          z.string().nullable().optional(),
  reFirePolicy:         z.enum(["every", "once"]).optional(),
  maxDurationDays:      z.number().int().positive().nullable().optional(),
});

export async function GET(req: NextRequest) {
  try {
    // Reuses the automations permission until Phase 1B introduces a
    // dedicated workflows:* permission set.
    const r = await requireAccess("workflows:read");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    const where: any = { workspaceId };
    if (status && STATUSES.includes(status as any)) where.status = status;

    const workflows = await db.workflow.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true, name: true, description: true, status: true,
        triggerType: true, triggerConfig: true,
        startNodeId: true,
        totalEnrolled: true, activeCount: true, completedCount: true,
        exitedCount: true, failedCount: true,
        lastTriggeredAt: true,
        createdAt: true, updatedAt: true,
      },
    });

    return ok(workflows);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const r = await requireAccess("workflows:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const data = createSchema.parse(await req.json());

    const workflow = await db.workflow.create({
      data: {
        workspaceId,
        name:                 data.name,
        description:          data.description ?? null,
        triggerType:          data.triggerType,
        triggerConfig:        data.triggerConfig,
        nodes:                data.nodes,
        edges:                data.edges,
        startNodeId:          data.startNodeId ?? null,
        reFirePolicy:         data.reFirePolicy ?? defaultReFirePolicy(data.triggerType),
        maxDurationDays:      data.maxDurationDays ?? null,
        status:               "DRAFT",
      },
    });

    return ok(workflow, 201);
  } catch (error) {
    return handleError(error);
  }
}
