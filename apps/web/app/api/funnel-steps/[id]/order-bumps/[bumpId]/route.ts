import { db } from "@launchtic/database";
import { NextRequest, NextResponse } from "next/server";
import { requireAccess } from "../../../../../../lib/permissions";
import { invalidateStepCache } from "../../../../../../lib/funnels/step-cache";

type Props = { params: Promise<{ id: string; bumpId: string }> };

async function verifyBump(bumpId: string, stepId: string, workspaceId: string) {
  const bump = await db.orderBump.findUnique({
    where: { id: bumpId },
    include: {
      funnelStep: {
        select: { physicalProductId: true, funnel: { select: { workspaceId: true, currency: true } } },
      },
    },
  });
  if (!bump || bump.funnelStepId !== stepId || bump.funnelStep.funnel.workspaceId !== workspaceId) return null;
  return bump;
}

export async function PATCH(req: NextRequest, { params }: Props) {
  const r = await requireAccess("funnels:bumps:write");
  if (!r.ok) return r.response;
  const { workspaceId } = r;
  const { id, bumpId } = await params;

  const bump = await verifyBump(bumpId, id, workspaceId);
  if (!bump) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { label, headline, offerType, physicalProductId, shippingFee } = await req.json();

  if (physicalProductId && physicalProductId === bump.funnelStep.physicalProductId) {
    return NextResponse.json(
      { error: "Order bump cannot use the same product as the main offer" },
      { status: 400 }
    );
  }

  // Bump physical product must share funnel currency (one currency per checkout)
  if (physicalProductId) {
    const product = await db.physicalProduct.findUnique({ where: { id: physicalProductId } });
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 400 });
    }
    if (product.currency.toLowerCase() !== bump.funnelStep.funnel.currency.toLowerCase()) {
      return NextResponse.json(
        { error: `Product currency (${product.currency.toUpperCase()}) does not match funnel currency (${bump.funnelStep.funnel.currency.toUpperCase()}).` },
        { status: 400 },
      );
    }
  }

  const updated = await db.orderBump.update({
    where: { id: bumpId },
    data: {
      label:             label?.trim()      ?? undefined,
      headline:          headline !== undefined ? (headline?.trim() || null) : undefined,
      offerType:         offerType          ?? undefined,
      physicalProductId: physicalProductId !== undefined ? (physicalProductId || null) : undefined,
      shippingFee:       shippingFee !== undefined ? Math.round((parseFloat(shippingFee) || 0) * 100) : undefined,
    },
    include: {
      pricePlans: { orderBy: { createdAt: "asc" } },
      resources:  { orderBy: { createdAt: "asc" } },
    },
  });

  await invalidateStepCache(workspaceId, id);

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Props) {
  const r = await requireAccess("funnels:bumps:write");
  if (!r.ok) return r.response;
  const { workspaceId } = r;
  const { id, bumpId } = await params;

  const bump = await verifyBump(bumpId, id, workspaceId);
  if (!bump) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // OrderBumpPricePlan cascade-deletes from OrderBump; Order/Subscription FKs
  // to those plans are SET NULL. Snapshots in Order/Subscription preserve the
  // historical bump name + amount for invoices and analytics.
  await db.orderBump.delete({ where: { id: bumpId } });
  await invalidateStepCache(workspaceId, id);
  return NextResponse.json({ ok: true });
}
