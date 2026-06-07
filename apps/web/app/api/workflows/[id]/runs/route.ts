// List runs (and their steps) for one workflow — feeds the "Run history"
// timeline in the Phase 1B UI. Paginated by createdAt cursor.

import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const r = await requireAccess("workflows:read");
    if (!r.ok) return r.response;
    const { workspaceId } = r;
    const { id } = await params;

    const workflow = await db.workflow.findFirst({ where: { id, workspaceId }, select: { id: true } });
    if (!workflow) return err("Workflow not found", 404);

    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get("cursor");
    const PAGE   = 50;

    const runs = await db.workflowRun.findMany({
      where:   { workflowId: id },
      include: {
        contact: { select: { id: true, email: true, firstName: true, lastName: true } },
        steps:   { orderBy: { startedAt: "asc" }, take: 200 },
      },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      take:    PAGE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore    = runs.length > PAGE;
    const items      = hasMore ? runs.slice(0, PAGE) : runs;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return ok({ items, nextCursor });
  } catch (error) {
    return handleError(error);
  }
}
