// Page template tools — let AI list available templates and pick the best
// match per step when creating/editing funnels. Templates are workspace-
// scoped: each workspace sees only its own (seeded on register, plus any
// the operator created or imported).
//
// AI usage pattern:
//   1. list_page_templates({ type: "LANDING" }) → see options + content summaries
//   2. Pick best ID based on product context
//   3. Pass to create_funnel_from_spec({ templateIds: { sales: "..." } })
//      OR add_funnel_step({ templateId: "..." })
//      OR swap_step_template({ stepId, templateId })

import { z } from "zod";
import { db } from "@launchtic/database";
import { defineTool } from "./define";
import { summarizeTemplate, summaryLine } from "../../page-templates/summarize";

const listPageTemplates = defineTool({
  name: "list_page_templates",
  description:
    "List page templates available for funnel steps. Use BEFORE create_funnel_from_spec, add_funnel_step, or swap_step_template to pick the best template per step type. " +
    "Each template comes with a summary read from its content: purpose (landing pages: 'lead capture' = has a form, 'sales' = no form), " +
    "section count, notable elements (form, price / buy button, countdown, faq, video) and its first headlines — " +
    "use the headlines to judge niche and tone. Pass `purpose` to list only lead-capture or sales landing pages.",
  inputSchema: z.object({
    type: z.enum(["LANDING", "CHECKOUT", "UPSELL", "DOWNSELL", "THANKYOU", "CUSTOM"]).optional()
      .describe("Filter by step type. CUSTOM = generic static page (about/privacy/terms)."),
    purpose: z.enum(["lead capture", "sales"]).optional()
      .describe("Landing pages only: 'lead capture' for opt-in / lead magnet pages, 'sales' for pages that sell."),
  }),
  requiresConfirm: false,
  requiredPermission: "settings:page_templates:read",
  execute: async ({ type, purpose }, ctx) => {
    const where: any = { workspaceId: ctx.workspaceId, isActive: true };
    if (type) where.type = type;
    else if (purpose) where.type = "LANDING";

    const templates = await db.pageTemplate.findMany({
      where,
      // Defaults first so AI knows the recommended baseline; alphabetical
      // within group for predictable order.
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      select: { id: true, name: true, type: true, isDefault: true, pageJson: true },
    });

    const rows = templates
      .map((t) => ({ t, summary: summarizeTemplate(t.pageJson, t.type) }))
      .filter(({ summary }) => !purpose || summary.purpose === purpose);

    return {
      count: rows.length,
      templates: rows.map(({ t, summary }) => ({
        id: t.id,
        name: t.name,
        stepType: t.type,
        isDefault: t.isDefault,
        summary: summaryLine(summary),
      })),
    };
  },
});

const swapStepTemplate = defineTool({
  name: "swap_step_template",
  description:
    "Replace a funnel step's page with a different template. PERMANENT — wipes any operator edits made in the editor. " +
    "Template type must match step type (can't put a SALES template on a CHECKOUT step). " +
    "Use list_page_templates first to find a matching templateId.",
  inputSchema: z.object({
    stepId:     z.string().describe("Funnel step ID. Use get_funnel_details or list_funnels to find."),
    templateId: z.string().describe("PageTemplate ID. Use list_page_templates to find."),
  }),
  requiresConfirm: true,
  requiredPermission: "funnels:write",
  summary: async (a, ctx) => {
    const [step, tpl] = await Promise.all([
      db.funnelStep.findFirst({
        where: { id: a.stepId, funnel: { workspaceId: ctx.workspaceId } },
        select: { name: true, type: true, funnel: { select: { name: true } } },
      }),
      db.pageTemplate.findFirst({
        where: { id: a.templateId, workspaceId: ctx.workspaceId },
        select: { name: true, type: true },
      }),
    ]);
    if (!step || !tpl) return `Swap step ${a.stepId} → template ${a.templateId}`;
    return `Swap "${step.name}" (${step.type}) in "${step.funnel.name}" to template "${tpl.name}". ⚠️ Existing page content WIPED.`;
  },
  execute: async (args, ctx) => {
    const step = await db.funnelStep.findFirst({
      where: { id: args.stepId, funnel: { workspaceId: ctx.workspaceId } },
      select: { id: true, type: true, name: true, funnel: { select: { id: true } } },
    });
    if (!step) throw new Error("Step not found");

    const template = await db.pageTemplate.findFirst({
      where: { id: args.templateId, workspaceId: ctx.workspaceId },
      select: { pageJson: true, meta: true, type: true, name: true },
    });
    if (!template) throw new Error("Template not found");

    // Type mismatch = visual chaos (e.g. CHECKOUT components in a SALES step
    // wouldn't have payment form wiring). Block at tool level rather than
    // letting it through to the editor where it would be confusing.
    if (template.type !== step.type) {
      throw new Error(
        `Template type ${template.type} doesn't match step type ${step.type}. ` +
        `Use list_page_templates with type=${step.type} to find compatible templates.`,
      );
    }

    await db.funnelStep.update({
      where: { id: step.id },
      data: {
        pageJson: template.pageJson as any,
        meta:     (template.meta ?? {}) as any,
      },
    });

    return {
      stepId: step.id,
      stepName: step.name,
      templateName: template.name,
      message: `Template swapped to "${template.name}". [Open editor](/${ctx.workspaceSlug}/funnels/${step.funnel.id}) to review.`,
    };
  },
});

export const pageTemplateTools = [listPageTemplates, swapStepTemplate];
