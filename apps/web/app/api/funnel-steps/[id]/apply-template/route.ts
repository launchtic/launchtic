import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";
import { extractSlotsFromPageJson } from "../../../../../lib/page-templates/slots";
import { fillSlotsInPageJson } from "../../../../../lib/page-templates/slot-filler";
import { generateSampleSlotValues } from "../../../../../lib/page-templates/sample-fill";

// POST /api/funnel-steps/:id/apply-template
//   body: { templateId }
// Replaces the step's pageJson with the chosen template. Copy is rewritten
// afterwards with the editor's AI rewrite, not here.

const schema = z.object({
  templateId: z.string().min(1),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const r = await requireAccess("funnels:write");
    if (!r.ok) return r.response;
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

    // Templates created before real-copy templates may still hold {{slot}}
    // placeholders — fill them with sample text so no literal slot shows.
    const slots = extractSlotsFromPageJson(pageJson);
    if (slots.length > 0) {
      pageJson = fillSlotsInPageJson(pageJson, generateSampleSlotValues(slots));
    }

    await db.funnelStep.update({
      where: { id },
      data: { pageJson },
    });

    // Invalidate renderer cache so the new content shows up immediately.
    invalidateCache(step.funnel.workspaceId, step.slug).catch(() => {});

    return ok({ applied: true });
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
