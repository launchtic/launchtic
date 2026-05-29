-- One-click upsell/downsell branching targets on a funnel step.
-- Null → renderer falls back to the next step by `order`.
ALTER TABLE "FunnelStep" ADD COLUMN "acceptStepId" TEXT;
ALTER TABLE "FunnelStep" ADD COLUMN "declineStepId" TEXT;
