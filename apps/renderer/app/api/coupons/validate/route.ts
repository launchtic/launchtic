import { NextRequest, NextResponse } from "next/server";
import { db } from "@launchtic/database";

export async function POST(req: NextRequest) {
  try {
    const { code, funnelStepId } = await req.json();
    if (!code) return NextResponse.json({ success: false, error: "Coupon code is required" }, { status: 400 });
    if (!funnelStepId) return NextResponse.json({ success: false, error: "funnelStepId is required" }, { status: 400 });

    const step = await db.funnelStep.findUnique({
      where: { id: funnelStepId },
      select: { funnel: { select: { workspaceId: true } } },
    });
    if (!step) return NextResponse.json({ success: false, error: "Funnel step not found" }, { status: 404 });

    const { workspaceId } = step.funnel;
    // couponIds field added in migration — fall back to [] if not yet available
    const stepFull = await db.funnelStep.findUnique({ where: { id: funnelStepId } }).catch(() => null);
    const stepCouponIds: string[] = (stepFull as any)?.couponIds ?? [];

    const coupon = await db.coupon.findUnique({
      where: { workspaceId_code: { workspaceId, code } },
    });

    if (!coupon || !coupon.active) {
      return NextResponse.json({ success: true, data: { valid: false, message: "Invalid coupon code" } });
    }
    // Coupon must be explicitly enabled on this step
    if (!stepCouponIds.includes(coupon.id)) {
      return NextResponse.json({ success: true, data: { valid: false, message: "Coupon not valid for this page" } });
    }
    if (coupon.expiresAt && coupon.expiresAt <= new Date()) {
      return NextResponse.json({ success: true, data: { valid: false, message: "Coupon has expired" } });
    }
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
      return NextResponse.json({ success: true, data: { valid: false, message: "Coupon usage limit reached" } });
    }

    return NextResponse.json({
      success: true,
      data: {
        valid: true,
        discount: coupon.discount,
        type: coupon.type,
        message: coupon.type === "percentage"
          ? `${coupon.discount}% discount applied`
          : `$${(coupon.discount / 100).toFixed(2)} discount applied`,
      },
    });
  } catch (error) {
    console.error("[/api/coupons/validate]", error);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
