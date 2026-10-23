import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";
import { classifyRequest, editPageCopy, rewritePageCopy, scanPageCopy } from "../../../../../lib/page-templates/ai-rewrite";

// POST /api/funnel-steps/:id/ai-rewrite
//   { mode: "scan",    pageJson?, scopeNodeId? }        → { total }  (no AI call)
//   { mode: "auto",    pageJson?, request }             → classify, then rewrite or edit the whole page
//   { mode: "rewrite", pageJson?, brief }               → whole page rewritten for a brief
//   { mode: "edit",    pageJson?, scopeNodeId?, instruction } → section/element (or whole page) edited
// Saves nothing — the editor applies the result. pageJson is the editor's
// current (possibly unsaved) content; when omitted the step's stored page is used.
// :id may also be a page template id (page-template editor).

const pageJson = z.union([z.string(), z.record(z.unknown())]).optional();

const schema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("scan"), pageJson, scopeNodeId: z.string().min(1).optional() }),
  z.object({ mode: z.literal("rewrite"), pageJson, brief: z.string().trim().min(1).max(2000) }),
  z.object({ mode: z.literal("auto"), pageJson, request: z.string().trim().min(1).max(2000) }),
  z.object({
    mode: z.literal("edit"),
    pageJson,
    scopeNodeId: z.string().min(1).optional(),  // omitted = whole page
    instruction: z.string().trim().min(1).max(2000),
  }),
]);

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const r = await requireAccess("funnels:write");
    if (!r.ok) return r.response;
    const body = schema.parse(await req.json());

    // The page-template editor reuses this endpoint with a template id.
    const step = await db.funnelStep.findFirst({
      where: { id, funnel: { workspaceId: r.workspaceId } },
      select: { pageJson: true },
    }) ?? await db.pageTemplate.findFirst({
      where: { id, workspaceId: r.workspaceId },
      select: { pageJson: true },
    });
    if (!step) return err("Funnel step not found", 404);

    const source = body.pageJson ?? step.pageJson;
    if (body.mode === "scan") return ok(scanPageCopy(source, body.scopeNodeId));

    if (!r.isOwner && !r.permissions.includes("ai:use")) {
      return err("You don't have permission to use AI features.", 403);
    }
    try {
      if (body.mode === "auto") {
        const kind = await classifyRequest(r.workspaceId, body.request);
        const result = kind === "rewrite"
          ? await rewritePageCopy({ workspaceId: r.workspaceId, pageJson: source, brief: body.request })
          : await editPageCopy({ workspaceId: r.workspaceId, pageJson: source, instruction: body.request });
        return ok({ ...result, mode: kind });
      }
      const result = body.mode === "rewrite"
        ? await rewritePageCopy({ workspaceId: r.workspaceId, pageJson: source, brief: body.brief })
        : await editPageCopy({
            workspaceId: r.workspaceId,
            pageJson: source,
            scopeNodeId: body.scopeNodeId,
            instruction: body.instruction,
          });
      return ok(result);
    } catch (e) {
      return err((e as Error)?.message ?? "AI rewrite failed", 400);
    }
  } catch (error) {
    return handleError(error);
  }
}
