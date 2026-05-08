import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { z } from "zod";
import { ok, err, handleError, getWorkspaceId } from "../../../../../lib/api";
import { broadcastQueue, dispatchJobId } from "../../../../../lib/queue";

const schema = z.object({
  scheduledAt: z.string().datetime().optional(),  // ISO string; if absent, send now
});

// Minimum lead time for scheduled sends. Buffers against (a) the BullMQ
// scheduler tick interval, (b) any UI/clock drift between the user's browser
// and our server, and (c) operator's ability to cancel/edit before fire.
// Aligns with HubSpot's 15-min, ConvertKit's 10-min, ActiveCampaign's 5-min
// — 10 min is the industry sweet spot.
const MIN_LEAD_TIME_MS = 10 * 60_000;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) return err("Unauthorized", 401);

    const { id } = await params;
    const broadcast = await db.broadcast.findFirst({ where: { id, workspaceId } });
    if (!broadcast) return err("Broadcast not found", 404);
    if (broadcast.status !== "DRAFT" && broadcast.status !== "SCHEDULED") {
      return err(`Cannot send broadcast with status ${broadcast.status}`, 400);
    }

    // SMTP check — fail fast in API rather than letting worker fail the whole batch
    const settings = await db.workspaceSettings.findUnique({ where: { workspaceId } });
    const smtp = (settings as { smtp?: unknown } | null)?.smtp as Record<string, unknown> | undefined;
    if (!smtp?.host || !smtp?.passwordEnc) {
      return err("SMTP not configured. Configure it in Settings → SMTP first.", 400);
    }

    const body = await req.json().catch(() => ({}));
    const { scheduledAt } = schema.parse(body);

    const queue = broadcastQueue();
    const jobId = dispatchJobId(id);

    // Remove any prior scheduled job (re-scheduling)
    try { await queue.remove(jobId); } catch {}

    if (scheduledAt) {
      const when = new Date(scheduledAt);
      const delay = when.getTime() - Date.now();
      if (delay < MIN_LEAD_TIME_MS) {
        return err("Schedule time must be at least 10 minutes in the future.", 400);
      }

      await queue.add(
        "dispatch",
        { broadcastId: id, workspaceId },
        { jobId, delay },
      );
      const updated = await db.broadcast.update({
        where: { id },
        data: { status: "SCHEDULED", scheduledAt: when },
      });
      return ok(updated);
    }

    // Send now
    await queue.add(
      "dispatch",
      { broadcastId: id, workspaceId },
      { jobId },
    );
    const updated = await db.broadcast.update({
      where: { id },
      data: { status: "SCHEDULED", scheduledAt: new Date() },
    });
    return ok(updated);
  } catch (error) {
    return handleError(error);
  }
}
