import { NextRequest } from "next/server";
import Stripe from "stripe";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";
import { fireTrigger } from "../../../../../lib/automations";

// Best-effort SALE_CANCELED dispatch. Fires regardless of immediate-vs-scheduled
// because the operator's intent ("end this subscription") is the same — matches
// Systeme/Kartra/ClickFunnels behavior of firing at the cancel-action moment.
async function fireSaleCanceled(sub: {
  workspaceId: string;
  contactId: string;
  id: string;
  funnelStepId: string | null;
}) {
  const funnelId = sub.funnelStepId
    ? (await db.funnelStep.findUnique({
        where: { id: sub.funnelStepId },
        select: { funnelId: true },
      }))?.funnelId
    : undefined;
  fireTrigger(sub.workspaceId, "SALE_CANCELED", {
    contactId: sub.contactId,
    subscriptionId: sub.id,
    funnelId,
    funnelStepId: sub.funnelStepId ?? undefined,
  }).catch(() => {});
}

async function getPayPalToken(clientId: string, clientSecret: string, baseUrl: string): Promise<string> {
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal auth failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const r = await requireAccess("orders:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const immediate: boolean = body?.immediate === true;

    const sub = await db.subscription.findFirst({ where: { id, workspaceId } });
    if (!sub) return err("Subscription not found", 404);
    if (sub.status === "CANCELED") return err("Subscription is already canceled", 409);

    // TRIALING always cancels immediately (no money moved)
    const effectiveImmediate = sub.status === "TRIALING" ? true : immediate;

    if (sub.paymentProvider === "free") {
      await db.$transaction([
        db.subscription.update({
          where: { id: sub.id },
          data: { status: "CANCELED", cancelAtPeriodEnd: false },
        }),
        db.order.updateMany({
          where: { subscriptionId: sub.id, status: "TRIAL" },
          data: { status: "CANCELED" },
        }),
      ]);
      await fireSaleCanceled(sub);
      return ok({ canceledImmediately: true, cancelAtPeriodEnd: false });
    }

    if (sub.paymentProvider === "paypal") {
      const settings = await db.workspaceSettings.findUnique({ where: { workspaceId } });
      const config = (settings?.paypal as any) ?? {};
      if (!config?.clientId || !config?.clientSecret) return err("PayPal not configured", 500);

      const baseUrl = config.mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
      const token = await getPayPalToken(config.clientId, config.clientSecret, baseUrl);

      // Always cancel billing on PayPal immediately (no period-end API support)
      await fetch(`${baseUrl}/v1/billing/subscriptions/${sub.providerSubId}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Cancelled by merchant" }),
      });

      if (effectiveImmediate) {
        // Revoke access now
        await db.$transaction([
          db.subscription.update({
            where: { id: sub.id },
            data: { status: "CANCELED", cancelAtPeriodEnd: false },
          }),
          db.order.updateMany({
            where: { subscriptionId: sub.id, status: "TRIAL" },
            data: { status: "CANCELED" },
          }),
        ]);
        await fireSaleCanceled(sub);
        return ok({ canceledImmediately: true, cancelAtPeriodEnd: false });
      } else {
        // Billing stopped on PayPal, but keep access until period end in our DB
        await db.subscription.update({
          where: { id: sub.id },
          data: { cancelAtPeriodEnd: true },
        });
        await fireSaleCanceled(sub);
        return ok({ canceledImmediately: false, cancelAtPeriodEnd: true, currentPeriodEnd: sub.currentPeriodEnd ?? null });
      }
    }

    if (sub.paymentProvider !== "stripe") {
      return err(`Cancel not implemented for provider: ${sub.paymentProvider}`, 400);
    }

    const settings = await db.workspaceSettings.findUnique({ where: { workspaceId } });
    const config = (settings?.stripe as any) ?? {};
    if (!config?.secretKey) return err("Stripe not configured", 500);

    const stripe = new Stripe(config.secretKey, { apiVersion: "2026-04-22.dahlia" });

    if (effectiveImmediate) {
      await stripe.subscriptions.cancel(sub.providerSubId);
      await db.$transaction([
        db.subscription.update({
          where: { id: sub.id },
          data: { status: "CANCELED", cancelAtPeriodEnd: false },
        }),
        db.order.updateMany({
          where: { subscriptionId: sub.id, status: "TRIAL" },
          data: { status: "CANCELED" },
        }),
      ]);
      await fireSaleCanceled(sub);
      return ok({ canceledImmediately: true, cancelAtPeriodEnd: false });
    }

    const stripeSub = await stripe.subscriptions.update(sub.providerSubId, {
      cancel_at_period_end: true,
    });
    await db.subscription.update({
      where: { id: sub.id },
      data: { cancelAtPeriodEnd: true },
    });
    await fireSaleCanceled(sub);
    return ok({
      canceledImmediately: false,
      cancelAtPeriodEnd: true,
      currentPeriodEnd: (stripeSub as any).current_period_end ?? null,
    });
  } catch (error) {
    return handleError(error);
  }
}
