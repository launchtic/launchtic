-- Make PageTemplate workspace-scoped. Each workspace owns its own copy
-- (seeded on register from packages/database/src/seed-data/).
--
-- Strategy:
--   1. Add workspaceId as nullable so existing rows can be backfilled.
--   2. Backfill: existing PageTemplate rows (if any) go to the first
--      workspace by createdAt — this matches single-tenant self-host
--      reality. If no workspace exists (unlikely outside dev), drop the
--      orphan rows since they can't be attributed safely.
--   3. Enforce NOT NULL + FK with ON DELETE CASCADE.
--   4. Replace global indexes with workspace-prefixed ones.

ALTER TABLE "PageTemplate" ADD COLUMN "workspaceId" TEXT;

UPDATE "PageTemplate"
SET "workspaceId" = (SELECT "id" FROM "Workspace" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "workspaceId" IS NULL;

DELETE FROM "PageTemplate" WHERE "workspaceId" IS NULL;

ALTER TABLE "PageTemplate" ALTER COLUMN "workspaceId" SET NOT NULL;

ALTER TABLE "PageTemplate"
  ADD CONSTRAINT "PageTemplate_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX IF EXISTS "PageTemplate_type_isDefault_idx";

CREATE INDEX "PageTemplate_workspaceId_type_isDefault_idx" ON "PageTemplate"("workspaceId", "type", "isDefault");
CREATE INDEX "PageTemplate_workspaceId_idx" ON "PageTemplate"("workspaceId");
