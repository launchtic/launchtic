import { NextRequest } from "next/server";
import Stripe from "stripe";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const r = await requireAccess("subscriptions:cancel");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { id } = await params;

    const sub = await db.subscription.findFirst({ where: { id, workspaceId } });
    if (!sub) return err("Subscription not found", 404);
    if (sub.status === "CANCELED") return err("Subscription is already canceled", 409);
    if (!sub.cancelAtPeriodEnd) return err("Subscription is not scheduled to cancel", 409);

    if (sub.paymentProvider === "free") {
      await db.subscription.update({
        where: { id: sub.id },
        data: { cancelAtPeriodEnd: false },
      });
      return ok({ cancelAtPeriodEnd: false });
    }

    if (sub.paymentProvider !== "stripe") {
      return err(`Resume not implemented for provider: ${sub.paymentProvider}`, 400);
    }

    const settings = await db.workspaceSettings.findUnique({ where: { workspaceId } });
    const config = (settings?.stripe as any) ?? {};
    if (!config?.secretKey) return err("Stripe not configured", 500);

    const stripe = new Stripe(config.secretKey, { apiVersion: "2026-04-22.dahlia" });
    await stripe.subscriptions.update(sub.providerSubId, { cancel_at_period_end: false });

    await db.subscription.update({
      where: { id: sub.id },
      data: { cancelAtPeriodEnd: false },
    });
    return ok({ cancelAtPeriodEnd: false });
  } catch (error) {
    return handleError(error);
  }
}
