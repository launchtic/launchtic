import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../../lib/api";
import { extractSlotsFromPageJson } from "../../../../../lib/page-templates/slots";
import { fillSlotsInPageJson } from "../../../../../lib/page-templates/slot-filler";
import { fillSlotsWithAI } from "../../../../../lib/page-templates/ai-fill";

// POST /api/funnel-steps/:id/apply-template
//   body: { templateId, brief? }
// Replaces the step's pageJson with the chosen template. If the template
// contains {{slot}} placeholders AND a brief is provided AND AI is configured
// for the workspace, also runs the AI fill pass server-side. Falls back to a
// raw paste (slots stay literal) when AI isn't available — never blocks the
// apply.

const schema = z.object({
  templateId: z.string().min(1),
  brief: z.string().trim().min(1).max(2000).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = schema.parse(await req.json());

    const step = await db.funnelStep.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        slug: true,
        funnel: { select: { workspaceId: true } },
      },
    });
    if (!step) return err("Funnel step not found", 404);

    const tpl = await db.pageTemplate.findUnique({
      where: { id: body.templateId },
      select: { id: true, type: true, pageJson: true },
    });
    if (!tpl) return err("Template not found", 404);
    if (tpl.type !== step.type) {
      return err(
        `Template type ${tpl.type} does not match step type ${step.type}.`,
        400,
      );
    }

    let pageJson = tpl.pageJson as any;
    let aiFilled = false;
    let aiSkipReason: string | null = null;

    const slots = extractSlotsFromPageJson(pageJson);
    if (slots.length > 0 && body.brief) {
      try {
        const values = await fillSlotsWithAI({
          workspaceId: step.funnel.workspaceId,
          slots,
          brief: { industry: body.brief },
        });
        pageJson = fillSlotsInPageJson(pageJson, values);
        aiFilled = true;
      } catch (e) {
        // Common case: workspace AI not configured. Fall through to raw paste.
        aiSkipReason = (e as Error)?.message ?? "ai_fill_failed";
      }
    } else if (slots.length > 0) {
      aiSkipReason = "no_brief";
    }

    await db.funnelStep.update({
      where: { id },
      data: { pageJson },
    });

    // Invalidate renderer cache so the new content shows up immediately.
    invalidateCache(step.funnel.workspaceId, step.slug).catch(() => {});

    return ok({
      applied: true,
      slotCount: slots.length,
      aiFilled,
      aiSkipReason,
    });
  } catch (error) {
    return handleError(error);
  }
}

async function invalidateCache(workspaceId: string, slug: string) {
  try {
    const domains = await db.domain.findMany({
      where: { workspaceId },
      select: { domain: true },
    });
    const rendererUrl = process.env.RENDERER_URL ?? "http://localhost:3001";
    const targets = domains.length > 0 ? domains : [{ domain: "localhost:3001" }];
    for (const { domain } of targets) {
      fetch(`${rendererUrl}/api/cache/invalidate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, slug }),
      }).catch(() => {});
    }
  } catch { /* non-critical */ }
}
