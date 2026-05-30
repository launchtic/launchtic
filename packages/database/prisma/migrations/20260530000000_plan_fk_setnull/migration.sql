-- Switch plan FKs from ON DELETE RESTRICT (Prisma default) to ON DELETE SET NULL.
-- Merchant can now hard-delete a StepPricePlan / OrderBumpPricePlan after orders
-- have referenced it — historical rows preserve everything they need in
-- Order.orderItemSnapshot / Order.bumpItems / Subscription.planSnapshot, so the
-- row link itself is non-essential and was only blocking legitimate cleanup.

-- ── Order ─────────────────────────────────────────────────────────────────────
ALTER TABLE "Order" DROP CONSTRAINT "Order_stepPricePlanId_fkey";
ALTER TABLE "Order"
  ADD CONSTRAINT "Order_stepPricePlanId_fkey"
  FOREIGN KEY ("stepPricePlanId") REFERENCES "StepPricePlan"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Order" DROP CONSTRAINT "Order_orderBumpPricePlanId_fkey";
ALTER TABLE "Order"
  ADD CONSTRAINT "Order_orderBumpPricePlanId_fkey"
  FOREIGN KEY ("orderBumpPricePlanId") REFERENCES "OrderBumpPricePlan"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Subscription ─────────────────────────────────────────────────────────────
ALTER TABLE "Subscription" DROP CONSTRAINT "Subscription_stepPricePlanId_fkey";
ALTER TABLE "Subscription"
  ADD CONSTRAINT "Subscription_stepPricePlanId_fkey"
  FOREIGN KEY ("stepPricePlanId") REFERENCES "StepPricePlan"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Subscription" DROP CONSTRAINT "Subscription_orderBumpPricePlanId_fkey";
ALTER TABLE "Subscription"
  ADD CONSTRAINT "Subscription_orderBumpPricePlanId_fkey"
  FOREIGN KEY ("orderBumpPricePlanId") REFERENCES "OrderBumpPricePlan"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
