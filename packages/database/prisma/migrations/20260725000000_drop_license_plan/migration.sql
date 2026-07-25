-- Drop the LICENSE tier — it's replaced by FREE (Organization.plan = NULL,
-- no license needed). No rows reference LICENSE yet (pre-launch, no real
-- installs). Recreated because Postgres can't drop enum values in place.
ALTER TYPE "Plan" RENAME TO "Plan_old";

CREATE TYPE "Plan" AS ENUM ('AGENCY', 'CUSTOM');

ALTER TABLE "Organization"
  ALTER COLUMN "plan" TYPE "Plan" USING ("plan"::text::"Plan");

DROP TYPE "Plan_old";
