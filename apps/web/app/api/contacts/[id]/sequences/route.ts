import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("contacts:read");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { id: contactId } = await params;
    const contact = await db.contact.findFirst({
      where: { id: contactId, workspaceId },
      select: { id: true },
    });
    if (!contact) return err("Contact not found", 404);

    const enrollments = await db.contactSequenceEnrollment.findMany({
      where: { contactId, workspaceId },
      orderBy: { enrolledAt: "desc" },
      select: {
        id: true,
        status: true,
        currentStepIndex: true,
        nextSendAt: true,
        enrolledAt: true,
        completedAt: true,
        lastSentAt: true,
        exitReason: true,
        sequence: {
          select: {
            id: true,
            name: true,
            _count: { select: { steps: true } },
          },
        },
      },
    });

    return ok(enrollments);
  } catch (error) {
    return handleError(error);
  }
}
