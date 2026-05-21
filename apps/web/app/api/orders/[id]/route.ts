import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { z } from "zod";
import { ok, err, handleError } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";

const updateOrderSchema = z.object({
  status: z.enum(["PENDING", "PAID", "FAILED", "REFUNDED", "CANCELED"]),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("orders:read");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

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
    // Order status updates (cancel, mark refunded) share the same gate as
    // refund — destructive financial actions live behind orders:refund.
    const r = await requireAccess("orders:refund");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

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
