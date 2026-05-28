-- Drop the free COMMUNITY tier and introduce SOLO. Organization.plan becomes
-- nullable: NULL now represents "no valid license" (the locked state) — there
-- is no free tier to fall back to anymore.
--
-- Postgres can't remove an enum value in place, so we recreate the type.

-- 1. Drop the old default + NOT NULL so the column can hold NULL.
ALTER TABLE "Organization" ALTER COLUMN "plan" DROP DEFAULT;
ALTER TABLE "Organization" ALTER COLUMN "plan" DROP NOT NULL;

-- 2. Any existing COMMUNITY rows become NULL (locked). No paid data is lost.
UPDATE "Organization" SET "plan" = NULL WHERE "plan" = 'COMMUNITY';

-- 3. Recreate the enum without COMMUNITY and with SOLO.
ALTER TYPE "Plan" RENAME TO "Plan_old";
CREATE TYPE "Plan" AS ENUM ('SOLO', 'STARTER', 'AGENCY', 'CUSTOM');
ALTER TABLE "Organization"
  ALTER COLUMN "plan" TYPE "Plan" USING ("plan"::text::"Plan");
DROP TYPE "Plan_old";
