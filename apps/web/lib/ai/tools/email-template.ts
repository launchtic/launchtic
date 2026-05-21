// Email template tools. Read-only.
//
// Templates can be SYSTEM (seeded, e.g. order_confirmation) or user-created.
// Both are listable; only user templates would be editable (separate write
// tool, not yet implemented).

import { z } from "zod";
import { db } from "@launchtic/database";
import { defineTool } from "./define";

const listEmailTemplates = defineTool({
  name: "list_email_templates",
  description: "List email templates in the workspace (transactional, marketing, system). Use to find a template ID for reference or to answer 'what templates do I have'.",
  inputSchema: z.object({
    category: z.enum(["TRANSACTIONAL", "MARKETING", "SYSTEM"]).optional(),
    search:   z.string().optional().describe("Match against template name or subject."),
    limit:    z.number().int().min(1).max(50).default(20),
  }),
  requiresConfirm: false,
  requiredPermission: "email_templates:read",
  execute: async ({ category, search, limit }, ctx) => {
    const where: Record<string, unknown> = { workspaceId: ctx.workspaceId };
    if (category) where.category = category;
    if (search?.trim()) {
      where.OR = [
        { name:    { contains: search.trim(), mode: "insensitive" } },
        { subject: { contains: search.trim(), mode: "insensitive" } },
      ];
    }
    const templates = await db.emailTemplate.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: {
        id: true, name: true, subject: true, category: true,
        isSystem: true, systemKey: true, updatedAt: true,
      },
    });
    return {
      count: templates.length,
      templates: templates.map((t) => ({
        id:        t.id,
        name:      t.name,
        subject:   t.subject,
        category:  t.category,
        isSystem:  t.isSystem,
        systemKey: t.systemKey ?? null,
        updatedAt: t.updatedAt.toISOString(),
      })),
    };
  },
});

const getEmailTemplateDetails = defineTool({
  name: "get_email_template_details",
  description: "Get full details of one email template including a preview of the body. Use list_email_templates first to find the ID.",
  inputSchema: z.object({
    templateId: z.string(),
  }),
  requiresConfirm: false,
  requiredPermission: "email_templates:read",
  execute: async ({ templateId }, ctx) => {
    const t = await db.emailTemplate.findFirst({
      where: { id: templateId, workspaceId: ctx.workspaceId },
    });
    if (!t) return { error: "Email template not found" };
    // Strip HTML for a readable preview — never dump the raw Maily JSON,
    // it's noisy and useless to surface in chat.
    const textPreview = t.htmlBody
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 400);
    return {
      id:        t.id,
      name:      t.name,
      subject:   t.subject,
      category:  t.category,
      isSystem:  t.isSystem,
      systemKey: t.systemKey ?? null,
      bodyPreview: textPreview + (textPreview.length === 400 ? "…" : ""),
      updatedAt: t.updatedAt.toISOString(),
    };
  },
});

export const emailTemplateTools = [listEmailTemplates, getEmailTemplateDetails];
