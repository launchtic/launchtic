import { db } from "@launchtic/database";
import { NextRequest, NextResponse } from "next/server";
import { requireAccess } from "../../../../../lib/permissions";

type Props = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Props) {
  const r = await requireAccess("funnels:write");
  if (!r.ok) return r.response;
  const { workspaceId } = r;
  const { id } = await params;

  const step = await db.funnelStep.findUnique({
    where: { id },
    include: { funnel: { select: { workspaceId: true, currency: true } } },
  });
  if (!step || step.funnel.workspaceId !== workspaceId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { offerType, physicalProductId, shippingFee } = await req.json();

  // Validate physicalProduct belongs to same workspace and shares funnel currency
  if (offerType === "PHYSICAL" && physicalProductId) {
    const product = await db.physicalProduct.findUnique({ where: { id: physicalProductId } });
    if (!product || product.workspaceId !== workspaceId) {
      return NextResponse.json({ error: "Invalid product" }, { status: 400 });
    }
    if (product.currency.toLowerCase() !== step.funnel.currency.toLowerCase()) {
      return NextResponse.json(
        { error: `Product currency (${product.currency.toUpperCase()}) does not match funnel currency (${step.funnel.currency.toUpperCase()}).` },
        { status: 400 },
      );
    }
  }

  const updated = await db.funnelStep.update({
    where: { id },
    data: {
      offerType: offerType ?? null,
      physicalProductId: offerType === "PHYSICAL" ? (physicalProductId ?? null) : null,
      shippingFee: offerType === "PHYSICAL" ? (shippingFee ?? 0) : 0,
    },
  });

  return NextResponse.json({ offerType: updated.offerType, physicalProductId: updated.physicalProductId, shippingFee: updated.shippingFee });
}
