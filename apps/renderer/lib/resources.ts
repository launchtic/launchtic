// Resource granting for paid/trial orders.
//
// Funnel steps and order bumps can declare resources (FunnelStepResource,
// OrderBumpResource) that should be granted to the buyer when an order
// transitions to PAID or TRIAL. This module is the single place that walks
// an order's resource config and applies it.
//
// Idempotent — safe to call multiple times for the same order. Backed by
// the unique index on ContactResourceAccess (contactId, type, resourceId, orderId).

import { db } from "@launchtic/database";
import { fireTrigger } from "./automations";

type BumpItem = { orderBumpId?: string };
type OrderItemSnapshot = { orderBumpId?: string };

export async function grantOrderResources(orderId: string): Promise<void> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      workspaceId: true,
      contactId: true,
      funnelStepId: true,
      stepPricePlanId: true,
      orderItemSnapshot: true,
      bumpItems: true,
      isRenewal: true,
    },
  });
  if (!order) return;
  // Renewal orders inherit access granted on the initial order.
  if (order.isRenewal) return;

  // ─── Collect resource configs that apply to this order ─────────────────────

  // Step resources apply when this order is the main step purchase.
  const stepResources = order.stepPricePlanId && order.funnelStepId
    ? await db.funnelStepResource.findMany({
        where: { funnelStepId: order.funnelStepId },
        select: { type: true, resourceId: true },
      })
    : [];

  // Bump IDs carried by this order:
  //   - bumpItems[] holds ONE_TIME bumps merged into the main order
  //   - orderItemSnapshot.orderBumpId is set when this order IS a subscription bump
  // Both read from snapshot — no DB lookup required, so a merchant hard-deleting
  // the bump plan after purchase doesn't break resource grants.
  const bumpIds = new Set<string>();
  if (Array.isArray(order.bumpItems)) {
    for (const item of order.bumpItems as BumpItem[]) {
      if (item?.orderBumpId) bumpIds.add(item.orderBumpId);
    }
  }
  const snapshotBumpId = (order.orderItemSnapshot as OrderItemSnapshot | null)?.orderBumpId;
  if (snapshotBumpId) bumpIds.add(snapshotBumpId);

  const bumpResources = bumpIds.size > 0
    ? await db.orderBumpResource.findMany({
        where: { orderBumpId: { in: [...bumpIds] } },
        select: { type: true, resourceId: true },
      })
    : [];

  // Dedupe across step + bump configs (same tag declared on both — apply once)
  const seen = new Set<string>();
  const resources: { type: string; resourceId: string }[] = [];
  for (const r of [...stepResources, ...bumpResources]) {
    const key = `${r.type}:${r.resourceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    resources.push(r);
  }
  if (resources.length === 0) return;

  // ─── Apply ────────────────────────────────────────────────────────────────
  // Only TAG has a delivery channel today. Other types (COURSE, COMMUNITY,
  // CALENDAR_EVENT, COURSE_BUNDLE) are marked "coming soon" in the UI — skip
  // until they get a real fulfillment target.
  for (const r of resources) {
    if (r.type !== "TAG") continue;

    const tag = await db.tag.findFirst({
      where: { id: r.resourceId, workspaceId: order.workspaceId },
      select: { id: true, name: true },
    });
    if (!tag) continue;

    // Dedup the TAG_ADDED trigger fire — only when the tag is newly added
    // to this contact. Matches the manual /contacts/[id]/tags route pattern.
    const existing = await db.contactTag.findUnique({
      where: { contactId_tagId: { contactId: order.contactId, tagId: tag.id } },
      select: { contactId: true },
    });

    await db.$transaction([
      db.contactTag.upsert({
        where: { contactId_tagId: { contactId: order.contactId, tagId: tag.id } },
        create: { contactId: order.contactId, tagId: tag.id },
        update: {},
      }),
      db.contactResourceAccess.upsert({
        where: {
          contactId_type_resourceId_orderId: {
            contactId: order.contactId,
            type: "TAG",
            resourceId: tag.id,
            orderId: order.id,
          },
        },
        create: {
          workspaceId: order.workspaceId,
          contactId: order.contactId,
          orderId: order.id,
          type: "TAG",
          resourceId: tag.id,
        },
        // Re-grant clears any prior revoke (e.g. refund then re-purchase)
        update: { revokedAt: null },
      }),
      ...(!existing
        ? [db.contactEvent.create({
            data: {
              contactId: order.contactId,
              type: "TAG_ADDED",
              data: { tagId: tag.id, tagName: tag.name, source: "purchase", orderId: order.id },
            },
          })]
        : []),
    ]);

    if (!existing) {
      fireTrigger(order.workspaceId, "TAG_ADDED", {
        contactId: order.contactId,
        tagId: tag.id,
        orderId: order.id,
      }).catch(() => {});
    }
  }
}
