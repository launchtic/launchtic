import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { ok, err, handleError, getWorkspaceId } from "../../../../../lib/api";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) return err("Unauthorized", 401);

    const { id } = await params;
    const automation = await db.automation.findFirst({
      where: { id, workspaceId },
      select: { id: true },
    });
    if (!automation) return err("Automation not found", 404);

    const { searchParams } = new URL(req.url);
    const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "50"));

    const runs = await db.automationRun.findMany({
      where: { automationId: id, workspaceId },
      orderBy: { startedAt: "desc" },
      take: limit,
      select: {
        id: true,
        status: true,
        triggerData: true,
        errorMessage: true,
        startedAt: true,
        completedAt: true,
        contact: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    return ok(runs);
  } catch (error) {
    return handleError(error);
  }
}
