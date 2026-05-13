import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess();
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { id } = await params;
    const broadcast = await db.broadcast.findFirst({
      where: { id, workspaceId },
      select: { id: true, status: true, totalRecipients: true },
    });
    if (!broadcast) return err("Broadcast not found", 404);

    const grouped = await db.emailSend.groupBy({
      by: ["status"],
      where: { broadcastId: id, workspaceId },
      _count: { _all: true },
    });

    const counts = { QUEUED: 0, SENT: 0, FAILED: 0, BOUNCED: 0 } as Record<string, number>;
    for (const row of grouped) counts[row.status] = row._count._all;

    return ok({
      total: broadcast.totalRecipients,
      sent: counts.SENT,
      failed: counts.FAILED,
      bounced: counts.BOUNCED,
      queued: counts.QUEUED,
    });
  } catch (error) {
    return handleError(error);
  }
}
