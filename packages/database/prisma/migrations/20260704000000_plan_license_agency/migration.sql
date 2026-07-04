-- Collapse the Plan enum to the two sellable tiers (LICENSE, AGENCY) plus the
-- sales-assisted CUSTOM. Legacy SOLO/STARTER are dropped — no rows reference
-- them (Organization.plan is the only column using this enum, and it's null
-- pre-activation). Recreated because Postgres can't drop enum values in place.
ALTER TYPE "Plan" RENAME TO "Plan_old";

CREATE TYPE "Plan" AS ENUM ('LICENSE', 'AGENCY', 'CUSTOM');

ALTER TABLE "Organization"
  ALTER COLUMN "plan" TYPE "Plan" USING ("plan"::text::"Plan");

DROP TYPE "Plan_old";
