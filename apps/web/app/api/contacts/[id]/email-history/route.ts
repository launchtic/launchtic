import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("contacts:read");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { id } = await params;
    const contact = await db.contact.findFirst({ where: { id, workspaceId }, select: { id: true } });
    if (!contact) return err("Contact not found", 404);

    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get("cursor");
    const PAGE_SIZE = 25;

    // Pattern B: source info comes from the snapshot columns. Single query;
    // no FK include needed. Frontend reads sourceType/sourceId/sourceLabel
    // directly and renders the source name from sourceLabel (which survives
    // rename / delete of the underlying Broadcast / WorkflowEmail / Template).
    const rows = await db.emailSend.findMany({
      where: { contactId: id, workspaceId },
      orderBy: [{ queuedAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true, subject: true, status: true,
        queuedAt: true, sentAt: true, failedAt: true,
        errorMessage: true,
        sourceType: true, sourceId: true, sourceLabel: true,
      },
    });

    const hasMore = rows.length > PAGE_SIZE;
    const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

    return ok({ items, nextCursor: hasMore ? items[items.length - 1].id : null });
  } catch (error) {
    return handleError(error);
  }
}
