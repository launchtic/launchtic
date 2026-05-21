// Subscription tools. Read-only.
//
// Cancellation belongs on `subscriptions:cancel` and isn't exposed yet —
// requires Stripe API + cancel-at-period-end vs immediate flow we haven't
// modeled for AI. Add separately when needed.

import { z } from "zod";
import { db } from "@launchtic/database";
import { defineTool } from "./define";

const listSubscriptions = defineTool({
  name: "list_subscriptions",
  description: "List recurring subscriptions in the workspace. Use to answer 'how many active subs', 'show trial users', etc.",
  inputSchema: z.object({
    status: z.enum(["TRIALING", "ACTIVE", "PAST_DUE", "CANCELED", "INCOMPLETE"]).optional(),
    limit:  z.number().int().min(1).max(50).default(20),
  }),
  requiresConfirm: false,
  requiredPermission: "subscriptions:read",
  execute: async ({ status, limit }, ctx) => {
    const subs = await db.subscription.findMany({
      where: { workspaceId: ctx.workspaceId, ...(status && { status }) },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true, status: true,
        currentPeriodEnd: true, cancelAtPeriodEnd: true, trialEnd: true,
        createdAt: true,
        contact: { select: { email: true } },
      },
    });
    return {
      count: subs.length,
      subscriptions: subs.map((s) => ({
        id:                 s.id,
        status:             s.status,
        contactEmail:       s.contact.email,
        currentPeriodEnd:   s.currentPeriodEnd?.toISOString() ?? null,
        cancelAtPeriodEnd:  s.cancelAtPeriodEnd,
        trialEnd:           s.trialEnd?.toISOString() ?? null,
        createdAt:          s.createdAt.toISOString(),
      })),
    };
  },
});

const getSubscriptionDetails = defineTool({
  name: "get_subscription_details",
  description: "Get full details of one subscription — plan snapshot, billing period, provider ID. Use list_subscriptions to find the ID.",
  inputSchema: z.object({
    subscriptionId: z.string(),
  }),
  requiresConfirm: false,
  requiredPermission: "subscriptions:read",
  execute: async ({ subscriptionId }, ctx) => {
    const s = await db.subscription.findFirst({
      where: { id: subscriptionId, workspaceId: ctx.workspaceId },
      include: {
        contact:       { select: { email: true, firstName: true, lastName: true } },
        stepPricePlan: { select: { name: true, amount: true, currency: true, interval: true } },
      },
    });
    if (!s) return { error: "Subscription not found" };
    return {
      id:                  s.id,
      status:              s.status,
      contact:             { email: s.contact.email, name: `${s.contact.firstName ?? ""} ${s.contact.lastName ?? ""}`.trim() || null },
      paymentProvider:     s.paymentProvider,
      providerSubId:       s.providerSubId,
      currentPeriodStart:  s.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd:    s.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd:   s.cancelAtPeriodEnd,
      trialEnd:            s.trialEnd?.toISOString() ?? null,
      plan:                s.stepPricePlan ? {
        name:     s.stepPricePlan.name,
        amount:   s.stepPricePlan.amount,
        currency: s.stepPricePlan.currency,
        interval: s.stepPricePlan.interval ?? null,
      } : null,
      createdAt:           s.createdAt.toISOString(),
    };
  },
});

export const subscriptionTools = [listSubscriptions, getSubscriptionDetails];
