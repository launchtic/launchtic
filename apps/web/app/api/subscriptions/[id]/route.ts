import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { ok, err, handleError, getWorkspaceId } from "../../../../lib/api";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) return err("Unauthorized", 401);

    const { id } = await params;
    const subscription = await db.subscription.findFirst({
      where: { id, workspaceId },
      include: {
        contact: { select: { id: true, email: true, firstName: true, lastName: true, phone: true, country: true } },
        funnelStep: { include: { funnel: { select: { id: true, name: true } } } },
        stepPricePlan: { select: { id: true, name: true, type: true, amount: true, currency: true, interval: true, trialDays: true } },
        orders: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true, status: true, total: true, currency: true, invoiceId: true,
            isRenewal: true, createdAt: true, orderItemSnapshot: true,
          },
        },
      },
    });
    if (!subscription) return err("Subscription not found", 404);

    return ok(subscription);
  } catch (error) {
    return handleError(error);
  }
}
