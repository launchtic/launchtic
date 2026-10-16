import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";
import { rewritePageCopy, scanPageCopy } from "../../../../../lib/page-templates/ai-rewrite";

// POST /api/funnel-steps/:id/ai-rewrite
//   { mode: "scan",    pageJson? }         → { total }  (no AI call)
//   { mode: "rewrite", pageJson?, brief }  → rewritten pageJson + before/after list
// Saves nothing — the editor decides whether to replace this step or create a
// new one. pageJson is the editor's current (possibly unsaved) content; when
// omitted the step's stored page is used.

const schema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("scan"),
    pageJson: z.union([z.string(), z.record(z.unknown())]).optional(),
  }),
  z.object({
    mode: z.literal("rewrite"),
    pageJson: z.union([z.string(), z.record(z.unknown())]).optional(),
    brief: z.string().trim().min(1).max(2000),
  }),
]);

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const r = await requireAccess("funnels:write");
    if (!r.ok) return r.response;
    const body = schema.parse(await req.json());

    const step = await db.funnelStep.findUnique({
      where: { id },
      select: { pageJson: true, funnel: { select: { workspaceId: true } } },
    });
    if (!step || step.funnel.workspaceId !== r.workspaceId) return err("Funnel step not found", 404);

    const source = body.pageJson ?? step.pageJson;
    if (body.mode === "scan") return ok(scanPageCopy(source));

    if (!r.isOwner && !r.permissions.includes("ai:use")) {
      return err("You don't have permission to use AI features.", 403);
    }
    try {
      const result = await rewritePageCopy({ workspaceId: r.workspaceId, pageJson: source, brief: body.brief });
      return ok(result);
    } catch (e) {
      return err((e as Error)?.message ?? "AI rewrite failed", 400);
    }
  } catch (error) {
    return handleError(error);
  }
}
