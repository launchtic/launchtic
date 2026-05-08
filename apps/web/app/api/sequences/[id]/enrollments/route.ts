import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { ok, err, handleError, getWorkspaceId } from "../../../../../lib/api";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) return err("Unauthorized", 401);

    const { id: sequenceId } = await params;
    const sequence = await db.emailSequence.findFirst({
      where: { id: sequenceId, workspaceId },
      select: { id: true },
    });
    if (!sequence) return err("Sequence not found", 404);

    const { searchParams } = new URL(req.url);
    const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "50"));
    const status = searchParams.get("status");

    const where: any = { sequenceId, workspaceId };
    if (status && ["ACTIVE", "COMPLETED", "EXITED", "FAILED"].includes(status)) {
      where.status = status;
    }

    const enrollments = await db.contactSequenceEnrollment.findMany({
      where,
      orderBy: [{ status: "asc" }, { nextSendAt: "asc" }],
      take: limit,
      select: {
        id: true,
        status: true,
        currentStepIndex: true,
        nextSendAt: true,
        enrolledAt: true,
        completedAt: true,
        lastSentAt: true,
        exitReason: true,
        contact: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    return ok(enrollments);
  } catch (error) {
    return handleError(error);
  }
}
