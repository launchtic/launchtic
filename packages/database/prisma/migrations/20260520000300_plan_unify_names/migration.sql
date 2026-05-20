-- Plan enum unification: rename FREE → COMMUNITY and ENTERPRISE → CUSTOM
-- so DB enum values match the UI labels exactly (no plan-label mapping
-- layer in app code).
--
-- Map for existing data:
--   FREE       → COMMUNITY
--   STARTER    → STARTER       (unchanged)
--   AGENCY     → AGENCY        (unchanged)
--   ENTERPRISE → CUSTOM
--   anything else → COMMUNITY  (defensive fallback)

ALTER TYPE "Plan" RENAME TO "Plan_old";

CREATE TYPE "Plan" AS ENUM ('COMMUNITY', 'STARTER', 'AGENCY', 'CUSTOM');

ALTER TABLE "User"
  ALTER COLUMN "plan" DROP DEFAULT;

ALTER TABLE "User"
  ALTER COLUMN "plan" TYPE "Plan" USING (
    CASE "plan"::text
      WHEN 'FREE'       THEN 'COMMUNITY'::"Plan"
      WHEN 'STARTER'    THEN 'STARTER'::"Plan"
      WHEN 'AGENCY'     THEN 'AGENCY'::"Plan"
      WHEN 'ENTERPRISE' THEN 'CUSTOM'::"Plan"
      ELSE 'COMMUNITY'::"Plan"
    END
  );

ALTER TABLE "User"
  ALTER COLUMN "plan" SET DEFAULT 'COMMUNITY'::"Plan";

DROP TYPE "Plan_old";
