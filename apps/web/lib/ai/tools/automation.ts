// Automation tools — list + status update only (no composite create-from-spec yet).
// Trigger + multi-action create flow lives in Phase 2C, not yet built.

import { z } from "zod";
import { db } from "@launchtic/database";
import { defineTool } from "./define";
import { resolveAutomationLabel } from "./resolvers";

const listAutomations = defineTool({
  name: "list_automations",
  description: "List automation rules with status and trigger fire counts.",
  inputSchema: z.object({
    status: z.enum(["DRAFT", "ACTIVE", "PAUSED"]).optional(),
  }),
  requiresConfirm: false,
  requiredPermission: "automations:read",
  execute: async ({ status }, ctx) => {
    const automations = await db.automation.findMany({
      where: { workspaceId: ctx.workspaceId, ...(status && { status }) },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true, name: true, status: true, triggerType: true,
        timesTriggered: true, lastTriggeredAt: true,
        _count: { select: { actions: true } },
      },
    });
    return {
      count: automations.length,
      automations: automations.map((a) => ({
        id: a.id,
        name: a.name,
        status: a.status,
        trigger: a.triggerType,
        actionCount: a._count.actions,
        timesTriggered: a.timesTriggered,
        lastTriggeredAt: a.lastTriggeredAt?.toISOString() ?? null,
      })),
    };
  },
});

const updateAutomationStatus = defineTool({
  name: "update_automation_status",
  description: "Pause or activate an automation rule.",
  inputSchema: z.object({
    automationId: z.string(),
    status:       z.enum(["ACTIVE", "PAUSED"]),
  }),
  requiresConfirm: true,
  requiredPermission: "automations:write",
  summary: async (a, ctx) => {
    const label = await resolveAutomationLabel(a.automationId, ctx);
    return `${a.status === "ACTIVE" ? "Activate" : "Pause"} automation "${label}"`;
  },
  execute: async (args, ctx) => {
    const auto = await db.automation.findFirst({
      where: { id: args.automationId, workspaceId: ctx.workspaceId },
      select: { id: true, name: true, status: true },
    });
    if (!auto) throw new Error("Automation not found");
    await db.automation.update({ where: { id: auto.id }, data: { status: args.status as any } });
    return { id: auto.id, name: auto.name, previousStatus: auto.status, newStatus: args.status };
  },
});

export const automationTools = [listAutomations, updateAutomationStatus];
