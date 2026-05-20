// Page template tools — let AI list available templates and pick the best
// match per step when creating/editing funnels. Templates are workspace-
// scoped: each workspace sees only its own (seeded on register, plus any
// the operator created or imported).
//
// AI usage pattern:
//   1. list_page_templates({ type: "SALES" }) → see options + descriptions
//   2. Pick best ID based on product context
//   3. Pass to create_funnel_from_spec({ templateIds: { sales: "..." } })
//      OR add_funnel_step({ templateId: "..." })
//      OR swap_step_template({ stepId, templateId })

import { z } from "zod";
import { db } from "@launchtic/database";
import { defineTool } from "./define";

const listPageTemplates = defineTool({
  name: "list_page_templates",
  description:
    "List page templates available for funnel steps. Use BEFORE create_funnel_from_spec, add_funnel_step, or swap_step_template to pick the best template per step type. " +
    "Pass `tags` to narrow by niche/style/mood/layout/features. Match by tag overlap (more matches = better fit). " +
    "Tag conventions:\n" +
    "  - niche: info-product, ebook, course, saas, coaching, consulting, ecommerce, physical-product, webinar, b2b, b2c\n" +
    "  - style: minimal, bold, dense, story-driven, editorial, modern, classic\n" +
    "  - mood: urgent, premium, friendly, professional, edgy, playful\n" +
    "  - layout: short-form, medium, long-form, hero-only, vsl, comparison\n" +
    "  - features: countdown, video, testimonials, faq, pricing-table, comparison-table, bullet-benefits, social-proof-numbers, risk-reversal, scarcity-banner, objection-handling, step-by-step",
  inputSchema: z.object({
    type: z.enum(["OPTIN", "SALES", "CHECKOUT", "UPSELL", "DOWNSELL", "THANKYOU", "CUSTOM"]).optional()
      .describe("Filter by step type. CUSTOM = generic static page (about/privacy/terms)."),
    tags: z.array(z.string()).optional()
      .describe("Filter by tags (any-of match). Pick from convention above based on product context — e.g. ['ebook', 'urgent', 'long-form'] for info-product launch."),
  }),
  requiresConfirm: false,
  execute: async ({ type, tags }, ctx) => {
    const where: any = { workspaceId: ctx.workspaceId, isActive: true };
    if (type) where.type = type;
    if (tags && tags.length > 0) where.tags = { hasSome: tags };

    const templates = await db.pageTemplate.findMany({
      where,
      // Defaults first so AI knows the recommended baseline; alphabetical
      // within group for predictable order.
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      select: {
        id: true, name: true, description: true, tags: true,
        type: true, isDefault: true,
      },
    });

    // Compute tag overlap score for ranking (server-side instead of DB
    // because Postgres doesn't have a native array-intersect-count operator
    // that's both indexable and easy to express; for ~100 templates this
    // is fine in app code).
    const requested = new Set((tags ?? []).map((t) => t.toLowerCase()));
    const ranked = templates
      .map((t) => {
        const overlap = (t.tags ?? []).filter((x) => requested.has(x.toLowerCase())).length;
        return { t, overlap };
      })
      .sort((a, b) => {
        if (b.overlap !== a.overlap) return b.overlap - a.overlap;
        if (Number(b.t.isDefault) !== Number(a.t.isDefault)) return Number(b.t.isDefault) - Number(a.t.isDefault);
        return a.t.name.localeCompare(b.t.name);
      });

    return {
      count: ranked.length,
      templates: ranked.map(({ t, overlap }) => ({
        id: t.id,
        name: t.name,
        description: t.description?.trim() || "(no description — pick by name + tags)",
        tags: t.tags ?? [],
        stepType: t.type,
        isDefault: t.isDefault,
        ...(requested.size > 0 ? { tagMatchCount: overlap } : {}),
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
      message: `Template swapped to "${template.name}". [Open editor](/funnels/${step.funnel.id}) to review.`,
    };
  },
});

export const pageTemplateTools = [listPageTemplates, swapStepTemplate];
