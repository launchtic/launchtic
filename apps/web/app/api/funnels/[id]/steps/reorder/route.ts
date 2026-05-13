import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../../../lib/api";
import { requireAccess } from "../../../../../../lib/permissions";

type Params = { params: Promise<{ id: string }> };

const reorderSchema = z.object({
  orderedIds: z.array(z.string()).min(1),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id: funnelId } = await params;
    const r = await requireAccess("funnels:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const funnel = await db.funnel.findUnique({ where: { id: funnelId, workspaceId } });
    if (!funnel) return err("Funnel not found", 404);

    const { orderedIds } = reorderSchema.parse(await req.json());

    await db.$transaction(
      orderedIds.map((stepId, index) =>
        db.funnelStep.update({
          where: { id: stepId, funnelId },
          data: { order: index + 1 },
        })
      )
    );

    return ok({ reordered: true });
  } catch (error) {
    return handleError(error);
  }
}
