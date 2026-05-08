import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { z } from "zod";
import { ok, err, handleError, getWorkspaceId } from "../../../../../lib/api";
import { validateAutomation } from "../../../../../lib/automation-validation";

const schema = z.object({ status: z.enum(["DRAFT", "ACTIVE", "PAUSED"]) });

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) return err("Unauthorized", 401);

    const { id } = await params;
    const { status } = schema.parse(await req.json());

    const existing = await db.automation.findFirst({
      where: { id, workspaceId },
      include: { actions: { orderBy: { order: "asc" } } },
    });
    if (!existing) return err("Automation not found", 404);

    if (status === "ACTIVE" && existing.actions.length === 0) {
      return err("Cannot activate automation with no actions", 400);
    }

    // Enforce hard validation errors on ACTIVE transition.
    // DRAFT/PAUSED can save anything — user iterates freely.
    if (status === "ACTIVE") {
      const [tags, funnels] = await Promise.all([
        db.tag.findMany({ where: { workspaceId }, select: { id: true } }),
        db.funnel.findMany({
          where: { workspaceId, status: "ACTIVE" },
          select: { id: true, steps: { select: { id: true, type: true } } },
        }),
      ]);

      const { errors } = validateAutomation({
        triggerType: existing.triggerType,
        triggerConfig: existing.triggerConfig as Record<string, unknown>,
        actions: existing.actions.map((a) => ({
          actionType: a.actionType,
          actionConfig: a.actionConfig as Record<string, unknown>,
          emailSubject: a.emailSubject,
          emailHtmlBody: a.emailHtmlBody,
        })),
        tags,
        funnels,
      });

      if (errors.length > 0) {
        return err(
          `Cannot activate — ${errors.length} validation error(s): ${errors.map((e) => e.message).join("; ")}`,
          400,
        );
      }
    }

    const updated = await db.automation.update({ where: { id }, data: { status } });
    return ok(updated);
  } catch (error) {
    return handleError(error);
  }
}
