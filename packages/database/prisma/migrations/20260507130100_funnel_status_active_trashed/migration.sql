-- Replace FunnelStatus enum: DRAFT/PUBLISHED/ARCHIVED → ACTIVE/TRASHED.
-- After dropping PageSnapshot, the DRAFT/PUBLISHED split has no meaning —
-- pages go live the moment the user saves. ACTIVE = visible, TRASHED = soft-deleted.
-- Mapping: DRAFT, PUBLISHED → ACTIVE; ARCHIVED → TRASHED.

-- 1. Create new enum
CREATE TYPE "FunnelStatus_new" AS ENUM ('ACTIVE', 'TRASHED');

-- 2. Drop default so we can change column type
ALTER TABLE "Funnel" ALTER COLUMN "status" DROP DEFAULT;

-- 3. Migrate data + change column type
ALTER TABLE "Funnel"
  ALTER COLUMN "status" TYPE "FunnelStatus_new"
  USING (
    CASE "status"::text
      WHEN 'DRAFT'     THEN 'ACTIVE'
      WHEN 'PUBLISHED' THEN 'ACTIVE'
      WHEN 'ARCHIVED'  THEN 'TRASHED'
    END::"FunnelStatus_new"
  );

-- 4. Restore default with new enum value
ALTER TABLE "Funnel" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

-- 5. Drop old enum, rename new
DROP TYPE "FunnelStatus";
ALTER TYPE "FunnelStatus_new" RENAME TO "FunnelStatus";

-- 6. Index for trash queries (workspaceId + status)
CREATE INDEX "Funnel_workspaceId_status_idx" ON "Funnel" ("workspaceId", "status");
