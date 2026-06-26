import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";

type Params = { params: Promise<{ id: string }> };

const PAGE_SIZE = 20;

// Workflow runs this contact has been enrolled in, cursor-paginated.
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("contacts:read");
    if (!r.ok) return r.response;

    const { id } = await params;
    const contact = await db.contact.findFirst({ where: { id, workspaceId: r.workspaceId }, select: { id: true } });
    if (!contact) return err("Contact not found", 404);

    const cursor = new URL(req.url).searchParams.get("cursor");

    const rows = await db.workflowRun.findMany({
      where: { contactId: id, workspaceId: r.workspaceId },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true, status: true, exitReason: true, startedAt: true, completedAt: true,
        workflow: { select: { name: true } },
      },
    });

    const hasMore = rows.length > PAGE_SIZE;
    const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

    return ok({
      items: page.map((w) => ({
        id: w.id,
        status: w.status,
        exitReason: w.exitReason,
        startedAt: w.startedAt.toISOString(),
        completedAt: w.completedAt ? w.completedAt.toISOString() : null,
        workflowName: w.workflow?.name ?? "Workflow",
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });
  } catch (error) {
    return handleError(error);
  }
}
