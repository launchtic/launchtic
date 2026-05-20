-- Plan enum migration: rename PRO → STARTER, add AGENCY.
-- Postgres can't rename or remove enum values directly, so the type has to be
-- recreated. Steps:
--   1. Rename current type out of the way.
--   2. Create the new type with the desired values.
--   3. Convert User.plan to the new type, mapping legacy PRO rows to STARTER.
--   4. Drop the old type.
-- A small data risk: any row using a value other than FREE/PRO/ENTERPRISE
-- (shouldn't exist — Prisma enforced it) would fall back to FREE.

ALTER TYPE "Plan" RENAME TO "Plan_old";

CREATE TYPE "Plan" AS ENUM ('FREE', 'STARTER', 'AGENCY', 'ENTERPRISE');

ALTER TABLE "User"
  ALTER COLUMN "plan" DROP DEFAULT;

ALTER TABLE "User"
  ALTER COLUMN "plan" TYPE "Plan" USING (
    CASE "plan"::text
      WHEN 'PRO'        THEN 'STARTER'::"Plan"
      WHEN 'ENTERPRISE' THEN 'ENTERPRISE'::"Plan"
      WHEN 'FREE'       THEN 'FREE'::"Plan"
      ELSE 'FREE'::"Plan"
    END
  );

ALTER TABLE "User"
  ALTER COLUMN "plan" SET DEFAULT 'FREE'::"Plan";

DROP TYPE "Plan_old";
