-- Link upsell/downsell orders to the main step Order they upsold from.
-- Drives dashboard grouping (1 main + N upsells) and refund cascading UX.
-- SetNull on parent delete so a child order survives independently.
ALTER TABLE "Order" ADD COLUMN "parentOrderId" TEXT;

CREATE INDEX "Order_parentOrderId_idx" ON "Order"("parentOrderId");

ALTER TABLE "Order" ADD CONSTRAINT "Order_parentOrderId_fkey"
  FOREIGN KEY ("parentOrderId") REFERENCES "Order"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
