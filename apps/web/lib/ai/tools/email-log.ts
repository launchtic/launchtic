// Email send log tool. Read-only.
//
// EmailSend rows are written by the broadcast/sequence/automation/transactional
// dispatchers. This tool surfaces them for "did the email go out" / "who
// bounced" / "show recent failures" questions.

import { z } from "zod";
import { db } from "@launchtic/database";
import { defineTool } from "./define";

const listEmailLogs = defineTool({
  name: "list_email_logs",
  description: "List recent email sends with delivery status. Use to debug delivery issues, check whether an email went out, or list bounces/failures. Read-only audit view.",
  inputSchema: z.object({
    status:       z.enum(["QUEUED", "SENT", "FAILED", "BOUNCED"]).optional(),
    contactEmail: z.string().optional().describe("Filter to a specific recipient email."),
    source:       z.enum(["broadcast", "sequence", "automation", "transactional"]).optional().describe("Filter by what dispatched the email."),
    limit:        z.number().int().min(1).max(100).default(25),
  }),
  requiresConfirm: false,
  requiredPermission: "email_logs:read",
  execute: async ({ status, contactEmail, source, limit }, ctx) => {
    const where: Record<string, unknown> = { workspaceId: ctx.workspaceId };
    if (status) where.status = status;
    if (contactEmail?.trim()) where.toEmail = contactEmail.trim().toLowerCase();
    if (source === "broadcast")     where.broadcastId       = { not: null };
    if (source === "sequence")      where.sequenceId        = { not: null };
    if (source === "automation")    where.automationId      = { not: null };
    if (source === "transactional") where.transactionalKey  = { not: null };

    const logs = await db.emailSend.findMany({
      where,
      orderBy: { queuedAt: "desc" },
      take: limit,
      select: {
        id: true, toEmail: true, subject: true, status: true,
        errorMessage: true, queuedAt: true, sentAt: true, failedAt: true,
        broadcastId: true, templateId: true, transactionalKey: true,
      },
    });
    return {
      count: logs.length,
      logs: logs.map((l) => ({
        id:           l.id,
        to:           l.toEmail,
        subject:      l.subject,
        status:       l.status,
        source:       l.broadcastId      ? "broadcast"
                    : l.templateId       ? "template"
                    : l.transactionalKey ? `transactional (${l.transactionalKey})`
                    : "workflow",
        error:        l.errorMessage ?? null,
        queuedAt:     l.queuedAt.toISOString(),
        sentAt:       l.sentAt?.toISOString() ?? null,
        failedAt:     l.failedAt?.toISOString() ?? null,
      })),
    };
  },
});

export const emailLogTools = [listEmailLogs];
