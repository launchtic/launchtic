import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";
import { aiSlotify } from "../../../../../lib/page-templates/ai-slotify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/page-templates/:id/slotify  (dev tool)
// AI-convert a designed template's real copy into {{slot}} placeholders.
// Body: { apply?: boolean } — apply defaults true (saves pageJson back).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const r = await requireAccess("settings:page_templates:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const apply = body?.apply !== false;

    const tpl = await db.pageTemplate.findFirst({ where: { id, workspaceId }, select: { id: true, pageJson: true } });
    if (!tpl) return err("Template not found", 404);

    const pageJson = typeof tpl.pageJson === "string" ? JSON.parse(tpl.pageJson) : (tpl.pageJson ?? {});
    const result = await aiSlotify({ workspaceId, pageJson });

    if (apply) {
      await db.pageTemplate.update({ where: { id }, data: { pageJson: result.pageJson } });
    }

    return ok({ count: result.count, slots: result.slots, sample: result.sample, applied: apply });
  } catch (error) {
    return handleError(error);
  }
}
