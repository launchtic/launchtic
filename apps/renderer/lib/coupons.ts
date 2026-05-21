// Coupon usage tracking.
//
// Increments Coupon.usedCount when an Order carrying a couponCode first
// transitions to PAID/TRIAL. Atomic via { increment: 1 } so concurrent
// webhooks/confirm calls can't double-update the row.
//
// NOT idempotent — must be called once per first-transition only. Place this
// inside the same status-transition guard that records the SALE transaction,
// never outside of it.

import { db } from "@launchtic/database";

export async function recordCouponUsage(
  workspaceId: string,
  couponCode: string | null | undefined,
): Promise<void> {
  if (!couponCode) return;
  try {
    await db.coupon.update({
      where: { workspaceId_code: { workspaceId, code: couponCode } },
      data: { usedCount: { increment: 1 } },
    });
  } catch (err) {
    // Coupon may have been deleted between checkout and capture. Best-effort.
    console.error("[recordCouponUsage]", { workspaceId, couponCode }, err);
  }
}
