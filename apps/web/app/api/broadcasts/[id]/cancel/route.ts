import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";
import { broadcastQueue, dispatchJobId } from "../../../../../lib/queue";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("emails:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { id } = await params;
    const broadcast = await db.broadcast.findFirst({ where: { id, workspaceId } });
    if (!broadcast) return err("Broadcast not found", 404);
    if (broadcast.status !== "SCHEDULED") {
      return err(`Cannot cancel broadcast with status ${broadcast.status}`, 400);
    }

    try { await broadcastQueue().remove(dispatchJobId(id)); } catch {}

    // Return to DRAFT (not CANCELED) so the operator can edit content and
    // reschedule. Industry pattern (Mailchimp, ActiveCampaign, ConvertKit):
    // canceling a scheduled send unschedules it back to draft state.
    // CANCELED status is reserved for terminal kills (e.g. abort mid-SENDING),
    // not the unschedule-to-edit flow.
    const updated = await db.broadcast.update({
      where: { id },
      data: { status: "DRAFT", scheduledAt: null },
    });
    return ok(updated);
  } catch (error) {
    return handleError(error);
  }
}
