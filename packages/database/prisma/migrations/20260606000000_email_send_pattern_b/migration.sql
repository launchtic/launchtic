-- EmailSend: collapse 4 source columns (broadcastId / workflowEmailId / templateId
-- / transactionalKey) + 3 FK relations into a generic snapshot pattern:
--   sourceType  ("BROADCAST" | "WORKFLOW" | "TEMPLATE" | "SYSTEM")
--   sourceId    (raw ID, no FK constraint)
--   sourceLabel (human-readable label captured at send time — survives delete)
--
-- See docs / commit message for rationale (Pattern B trade-off vs Pattern A).
-- Run order matters: backfill MUST complete before old columns are dropped.

-- ─── 1. Add new columns (nullable while we backfill) ─────────────────────────
ALTER TABLE "EmailSend"
  ADD COLUMN "sourceType"  TEXT,
  ADD COLUMN "sourceId"    TEXT,
  ADD COLUMN "sourceLabel" TEXT;

-- ─── 2. Backfill from existing FK columns ────────────────────────────────────
-- Order matters: BROADCAST > WORKFLOW > TEMPLATE > SYSTEM so the most specific
-- source wins if (somehow) more than one FK is set on the same row.

-- BROADCAST: join to capture name. Rows where Broadcast row exists.
UPDATE "EmailSend" es SET
  "sourceType"  = 'BROADCAST',
  "sourceId"    = es."broadcastId",
  "sourceLabel" = b."name"
FROM "Broadcast" b
WHERE es."broadcastId" = b."id"
  AND es."sourceType" IS NULL;

-- BROADCAST orphan: broadcastId set but no row (shouldn't happen with SET NULL
-- cascade, but harmless defense).
UPDATE "EmailSend" SET
  "sourceType"  = 'BROADCAST',
  "sourceId"    = "broadcastId",
  "sourceLabel" = 'Broadcast (deleted)'
WHERE "broadcastId" IS NOT NULL
  AND "sourceType" IS NULL;

-- WORKFLOW: join Workflow → WorkflowEmail for label format "Workflow · Email".
UPDATE "EmailSend" es SET
  "sourceType"  = 'WORKFLOW',
  "sourceId"    = es."workflowEmailId",
  "sourceLabel" = w."name" || ' · ' || COALESCE(NULLIF(we."name", ''), we."subject", '(untitled)')
FROM "WorkflowEmail" we
JOIN "Workflow" w ON w."id" = we."workflowId"
WHERE es."workflowEmailId" = we."id"
  AND es."sourceType" IS NULL;

UPDATE "EmailSend" SET
  "sourceType"  = 'WORKFLOW',
  "sourceId"    = "workflowEmailId",
  "sourceLabel" = 'Workflow (deleted)'
WHERE "workflowEmailId" IS NOT NULL
  AND "sourceType" IS NULL;

-- TEMPLATE
UPDATE "EmailSend" es SET
  "sourceType"  = 'TEMPLATE',
  "sourceId"    = es."templateId",
  "sourceLabel" = t."name"
FROM "EmailTemplate" t
WHERE es."templateId" = t."id"
  AND es."sourceType" IS NULL;

UPDATE "EmailSend" SET
  "sourceType"  = 'TEMPLATE',
  "sourceId"    = "templateId",
  "sourceLabel" = 'Template (deleted)'
WHERE "templateId" IS NOT NULL
  AND "sourceType" IS NULL;

-- SYSTEM: transactionalKey rows (order_confirmation, password reset, etc).
-- sourceLabel = the key itself (operator-meaningful identifier).
UPDATE "EmailSend" SET
  "sourceType"  = 'SYSTEM',
  "sourceLabel" = "transactionalKey"
WHERE "transactionalKey" IS NOT NULL
  AND "sourceType" IS NULL;

-- Remaining rows: all source FKs NULL (deleted source rows, or legacy data
-- predating the source-tracking columns). Tag as SYSTEM with generic label.
UPDATE "EmailSend" SET
  "sourceType"  = 'SYSTEM',
  "sourceLabel" = 'System'
WHERE "sourceType" IS NULL;

-- ─── 3. Drop old FK constraints + indexes ────────────────────────────────────
ALTER TABLE "EmailSend" DROP CONSTRAINT IF EXISTS "EmailSend_broadcastId_fkey";
ALTER TABLE "EmailSend" DROP CONSTRAINT IF EXISTS "EmailSend_templateId_fkey";
ALTER TABLE "EmailSend" DROP CONSTRAINT IF EXISTS "EmailSend_workflowEmailId_fkey";

DROP INDEX IF EXISTS "EmailSend_broadcastId_idx";
DROP INDEX IF EXISTS "EmailSend_contactId_broadcastId_openedAt_idx";
DROP INDEX IF EXISTS "EmailSend_contactId_broadcastId_clickedAt_idx";
DROP INDEX IF EXISTS "EmailSend_contactId_workflowEmailId_openedAt_idx";
DROP INDEX IF EXISTS "EmailSend_contactId_workflowEmailId_clickedAt_idx";

-- ─── 4. Drop old columns ─────────────────────────────────────────────────────
ALTER TABLE "EmailSend"
  DROP COLUMN "broadcastId",
  DROP COLUMN "templateId",
  DROP COLUMN "transactionalKey",
  DROP COLUMN "workflowEmailId";

-- ─── 5. Create new indexes ───────────────────────────────────────────────────
-- Covers logs source filter (workspaceId + sourceType, ordered by queuedAt for
-- timeline view).
CREATE INDEX "EmailSend_workspaceId_sourceType_queuedAt_idx"
  ON "EmailSend"("workspaceId", "sourceType", "queuedAt");

-- Covers workflow CONDITION executor queries:
--   email_opened   → WHERE contactId AND sourceType AND sourceId AND openedAt >= since
--   email_clicked  → WHERE contactId AND sourceType AND sourceId AND clickedAt >= since
CREATE INDEX "EmailSend_contactId_sourceType_sourceId_openedAt_idx"
  ON "EmailSend"("contactId", "sourceType", "sourceId", "openedAt");

CREATE INDEX "EmailSend_contactId_sourceType_sourceId_clickedAt_idx"
  ON "EmailSend"("contactId", "sourceType", "sourceId", "clickedAt");

-- Covers reverse-lookup "all sends from source X":
--   broadcast stats     → WHERE sourceType='BROADCAST' AND sourceId=broadcastId
--   broadcast retry     → same + status='FAILED'
--   broadcast worker    → re-fetch IDs after createMany
CREATE INDEX "EmailSend_sourceType_sourceId_idx"
  ON "EmailSend"("sourceType", "sourceId");
