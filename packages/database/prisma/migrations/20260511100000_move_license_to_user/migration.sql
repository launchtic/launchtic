-- Move plan/licenseKey/licenseExpiresAt from Workspace to User
-- License is now instance-level (per owner), not per workspace

ALTER TABLE "User" ADD COLUMN "plan" "Plan" NOT NULL DEFAULT 'FREE';
ALTER TABLE "User" ADD COLUMN "licenseKey" TEXT;
ALTER TABLE "User" ADD COLUMN "licenseExpiresAt" TIMESTAMP(3);

-- Migrate existing data: copy plan from the first workspace of each owner
UPDATE "User" u
SET
  "plan" = w."plan",
  "licenseKey" = w."licenseKey",
  "licenseExpiresAt" = w."licenseExpiresAt"
FROM (
  SELECT DISTINCT ON ("ownerId") "ownerId", "plan", "licenseKey", "licenseExpiresAt"
  FROM "Workspace"
  ORDER BY "ownerId", "createdAt" ASC
) w
WHERE u."id" = w."ownerId";

ALTER TABLE "Workspace" DROP COLUMN "plan";
ALTER TABLE "Workspace" DROP COLUMN "licenseKey";
ALTER TABLE "Workspace" DROP COLUMN "licenseExpiresAt";
