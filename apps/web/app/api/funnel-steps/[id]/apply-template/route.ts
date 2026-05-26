import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";
import { extractSlotsFromPageJson } from "../../../../../lib/page-templates/slots";
import { fillSlotsInPageJson } from "../../../../../lib/page-templates/slot-filler";
import { fillSlotsWithAI } from "../../../../../lib/page-templates/ai-fill";
import { generateSampleSlotValues } from "../../../../../lib/page-templates/sample-fill";

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
    const r = await requireAccess("funnels:write");
    if (!r.ok) return r.response;
    const { permissions, isOwner } = r;
    const body = schema.parse(await req.json());

    // AI slot-filling burns LLM tokens — gated separately by `ai:use` (same
    // permission as the chat widget). Required ONLY when the caller asks
    // for AI fill (brief present). Raw apply (no brief) needs only funnels:write.
    if (body.brief && !isOwner && !permissions.includes("ai:use")) {
      return err("You don't have permission to use AI features.", 403);
    }

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

    // Template must belong to the same workspace as the funnel — prevents
    // applying a sibling workspace's template by guessing its id.
    const tpl = await db.pageTemplate.findFirst({
      where: { id: body.templateId, workspaceId: step.funnel.workspaceId },
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

    // Slot-fill strategy:
    //   1. Has brief + AI configured → real AI fill (best quality)
    //   2. AI fails OR no brief OR user lacks ai:use → sample-data fill
    //      (good-enough placeholders so the page is editable instead of
    //      showing literal `{{slot}}` text)
    // The page always lands with editable content — operators tweak in
    // the page editor after applying.
    const slots = extractSlotsFromPageJson(pageJson);
    if (slots.length > 0) {
      if (body.brief) {
        try {
          const values = await fillSlotsWithAI({
            workspaceId: step.funnel.workspaceId,
            slots,
            brief: { industry: body.brief },
          });
          pageJson = fillSlotsInPageJson(pageJson, values);
          aiFilled = true;
        } catch (e) {
          // AI not configured / key invalid / quota → fall through to samples
          aiSkipReason = (e as Error)?.message ?? "ai_fill_failed";
          pageJson = fillSlotsInPageJson(pageJson, generateSampleSlotValues(slots));
        }
      } else {
        // No brief (or no ai:use perm — caller passed nothing) → samples
        aiSkipReason = "no_brief";
        pageJson = fillSlotsInPageJson(pageJson, generateSampleSlotValues(slots));
      }
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
    // Internal docker DNS hostname — direct hop to renderer container, avoids
    // bouncing through Caddy. Falls back to localhost for dev outside Docker.
    const rendererUrl = process.env.RENDERER_INTERNAL_URL ?? "http://renderer:3001";
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
