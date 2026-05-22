import { db } from "@launchtic/database";
import { NextRequest, NextResponse } from "next/server";
import { requireAccess } from "../../../../../lib/permissions";

type Props = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Props) {
  // Base gate: funnels:write covers structural changes — offerType
  // (DIGITAL/PHYSICAL), product link. Shipping fee is gated separately
  // below because it's revenue-sensitive (bundled under price_plans perm).
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

  // Shipping fee gate — revenue-sensitive, bundled under funnels:price_plans:write.
  // Compute target value the same way as the DB write below, then compare
  // against current. Only block when the user is actually CHANGING the
  // dollar amount (offerType flip → 0 isn't a "shipping change" per se,
  // it's a side-effect of removing PHYSICAL; we allow that under funnels:write).
  const targetShipping = offerType === "PHYSICAL" ? (shippingFee ?? 0) : 0;
  const shippingChanged =
    targetShipping !== step.shippingFee &&
    offerType === "PHYSICAL"; // only gate when PHYSICAL — non-PHYSICAL auto-zeros
  if (shippingChanged) {
    const hasPricing = r.isOwner || r.permissions.includes("funnels:price_plans:write");
    if (!hasPricing) {
      return NextResponse.json(
        {
          error:   "permission_denied",
          permission: "funnels:price_plans:write",
          message: "Changing shipping fee requires funnels:price_plans:write (revenue-sensitive).",
        },
        { status: 403 },
      );
    }
  }

  const updated = await db.funnelStep.update({
    where: { id },
    data: {
      offerType: offerType ?? null,
      physicalProductId: offerType === "PHYSICAL" ? (physicalProductId ?? null) : null,
      shippingFee: targetShipping,
    },
  });

  return NextResponse.json({ offerType: updated.offerType, physicalProductId: updated.physicalProductId, shippingFee: updated.shippingFee });
}
