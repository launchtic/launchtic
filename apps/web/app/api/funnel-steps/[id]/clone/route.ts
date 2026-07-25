import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";
import { generateUniqueSlug } from "../../../../../lib/funnels/slug-validation";

type Params = { params: Promise<{ id: string }> };

// POST /api/funnel-steps/:id/clone
// Duplicate a step into the same funnel, inserted right after the original:
// copies the page (pageJson), SEO/tracking meta, offer config, price plans,
// order bumps (with their plans + resources) and resource grants. Branching
// targets and A/B test state are intentionally NOT copied — a fresh duplicate
// routes by order and starts with no running test.
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const r = await requireAccess("funnels:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const src = await db.funnelStep.findUnique({
      where: { id },
      include: {
        funnel: { select: { id: true, workspaceId: true } },
        pricePlans: true,
        resources: true,
        orderBumps: { include: { pricePlans: true, resources: true } },
      },
    });
    if (!src || src.funnel.workspaceId !== workspaceId) return err("Step not found", 404);

    const slug = await generateUniqueSlug({
      workspaceId,
      funnelId: src.funnelId,
      baseName: `${src.slug || src.name}-copy`,
    });

    const newOrder = src.order + 1;

    const created = await db.$transaction(async (tx) => {
      // Make room directly after the original so the clone slots in next to it.
      await tx.funnelStep.updateMany({
        where: { funnelId: src.funnelId, order: { gte: newOrder } },
        data: { order: { increment: 1 } },
      });

      return tx.funnelStep.create({
        data: {
          funnelId: src.funnelId,
          name: `${src.name} (Copy)`,
          slug,
          type: src.type,
          order: newOrder,
          offerType: src.offerType,
          physicalProductId: src.physicalProductId,
          shippingFee: src.shippingFee,
          couponIds: src.couponIds,
          pageJson: src.pageJson as any,
          meta: src.meta as any,
          acceptStepId: null,
          declineStepId: null,
          abTestActive: false,
          // Cached external price IDs (stripePriceId/paypalPlanId) are dropped —
          // they're recreated lazily so the clone never shares a Stripe price.
          pricePlans: {
            create: src.pricePlans.map((p) => ({
              name: p.name, description: p.description, type: p.type,
              amount: p.amount, currency: p.currency, interval: p.interval, trialDays: p.trialDays,
            })),
          },
          resources: {
            create: src.resources.map((res) => ({ type: res.type, resourceId: res.resourceId })),
          },
          orderBumps: {
            create: src.orderBumps.map((b) => ({
              label: b.label, headline: b.headline, offerType: b.offerType,
              physicalProductId: b.physicalProductId, shippingFee: b.shippingFee, order: b.order,
              pricePlans: {
                create: b.pricePlans.map((p) => ({
                  name: p.name, description: p.description, type: p.type,
                  amount: p.amount, currency: p.currency, interval: p.interval, trialDays: p.trialDays,
                })),
              },
              resources: {
                create: b.resources.map((res) => ({ type: res.type, resourceId: res.resourceId })),
              },
            })),
          },
        },
        select: { id: true, name: true, slug: true, type: true, order: true, acceptStepId: true, declineStepId: true },
      });
    });

    return ok(created, 201);
  } catch (error) {
    return handleError(error);
  }
}
