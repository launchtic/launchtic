import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { z } from "zod";
import { ok, err, handleError } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";
import { broadcastQueue, dispatchJobId } from "../../../../lib/queue";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  subject: z.string().min(1).max(500).optional(),
  htmlBody: z.string().min(1).optional(),
  templateId: z.string().nullable().optional(),
  fromEmail: z.string().email().optional(),
  fromName: z.string().min(1).optional(),
  targetType: z.enum(["ALL_CONTACTS", "TAG"]).optional(),
  targetTagIds: z.array(z.string()).optional(),
  excludeUnsubscribed: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("broadcasts:read");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { id } = await params;
    const broadcast = await db.broadcast.findFirst({ where: { id, workspaceId } });
    if (!broadcast) return err("Broadcast not found", 404);

    return ok(broadcast);
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("broadcasts:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { id } = await params;
    const existing = await db.broadcast.findFirst({ where: { id, workspaceId } });
    if (!existing) return err("Broadcast not found", 404);
    const data = updateSchema.parse(await req.json());
    if (existing.status !== "DRAFT" && existing.status !== "SCHEDULED") {
      // Sent / finished broadcasts: only the name (a label) may be changed —
      // content/audience are locked once it's out the door.
      const keys = Object.keys(data);
      if (!(keys.length === 1 && keys[0] === "name" && typeof data.name === "string")) {
        return err(`Cannot edit broadcast with status ${existing.status}`, 400);
      }
    }
    const broadcast = await db.broadcast.update({ where: { id }, data });
    return ok(broadcast);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("broadcasts:delete");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { id } = await params;
    const existing = await db.broadcast.findFirst({ where: { id, workspaceId } });
    if (!existing) return err("Broadcast not found", 404);
    // Only block deletion mid-flight. SENT broadcasts can be removed — email
    // logs keep their own snapshot (sourceLabel) so history survives.
    if (existing.status === "SENDING") {
      return err(`Cannot delete broadcast with status ${existing.status}`, 400);
    }

    // Best-effort: remove pending dispatch job if scheduled
    if (existing.status === "SCHEDULED") {
      try {
        await broadcastQueue().remove(dispatchJobId(id));
      } catch {}
    }

    await db.broadcast.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
