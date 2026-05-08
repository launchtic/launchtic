import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { z } from "zod";
import { ok, err, handleError, getWorkspaceId } from "../../../../lib/api";

const updateOrderSchema = z.object({
  status: z.enum(["PENDING", "PAID", "FAILED", "REFUNDED", "CANCELED"]),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) return err("Unauthorized", 401);

    const { id } = await params;

    const order = await db.order.findFirst({
      where: { id, workspaceId },
      include: {
        contact: true,
        funnelStep: { include: { funnel: true } },
        stepPricePlan: true,
        transactions: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!order) return err("Order not found", 404);

    return ok(order);
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) return err("Unauthorized", 401);

    const { id } = await params;

    const existing = await db.order.findFirst({ where: { id, workspaceId } });
    if (!existing) return err("Order not found", 404);

    const body = await req.json();
    const { status } = updateOrderSchema.parse(body);

    const order = await db.order.update({
      where: { id },
      data: { status },
    });

    return ok(order);
  } catch (error) {
    return handleError(error);
  }
}
