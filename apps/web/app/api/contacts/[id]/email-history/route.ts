import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess();
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { id } = await params;
    const contact = await db.contact.findFirst({ where: { id, workspaceId }, select: { id: true } });
    if (!contact) return err("Contact not found", 404);

    const { searchParams } = new URL(req.url);
    const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "50"));

    const sends = await db.emailSend.findMany({
      where: { contactId: id, workspaceId },
      orderBy: { queuedAt: "desc" },
      take: limit,
      select: {
        id: true, subject: true, status: true,
        queuedAt: true, sentAt: true, failedAt: true,
        errorMessage: true,
        broadcastId: true, templateId: true, transactionalKey: true,
        broadcast: { select: { id: true, name: true } },
        template:  { select: { id: true, name: true } },
      },
    });

    return ok(sends);
  } catch (error) {
    return handleError(error);
  }
}
