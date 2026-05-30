-- Phase 1C: drop legacy Automation + EmailSequence subsystems. Workflow has
-- fully replaced them as the only automation primitive. No data preserved —
-- this runs on a pre-launch DB with no users.

-- ─── EmailSend: detach legacy FK columns ────────────────────────────────────
ALTER TABLE "EmailSend" DROP CONSTRAINT IF EXISTS "EmailSend_automationId_fkey";
ALTER TABLE "EmailSend" DROP CONSTRAINT IF EXISTS "EmailSend_automationRunId_fkey";
ALTER TABLE "EmailSend" DROP CONSTRAINT IF EXISTS "EmailSend_automationActionId_fkey";
ALTER TABLE "EmailSend" DROP CONSTRAINT IF EXISTS "EmailSend_sequenceId_fkey";
ALTER TABLE "EmailSend" DROP CONSTRAINT IF EXISTS "EmailSend_sequenceStepId_fkey";
ALTER TABLE "EmailSend" DROP CONSTRAINT IF EXISTS "EmailSend_enrollmentId_fkey";

DROP INDEX IF EXISTS "EmailSend_automationId_idx";
DROP INDEX IF EXISTS "EmailSend_sequenceId_idx";
DROP INDEX IF EXISTS "EmailSend_enrollmentId_idx";

ALTER TABLE "EmailSend" DROP COLUMN IF EXISTS "automationId";
ALTER TABLE "EmailSend" DROP COLUMN IF EXISTS "automationRunId";
ALTER TABLE "EmailSend" DROP COLUMN IF EXISTS "automationActionId";
ALTER TABLE "EmailSend" DROP COLUMN IF EXISTS "sequenceId";
ALTER TABLE "EmailSend" DROP COLUMN IF EXISTS "sequenceStepId";
ALTER TABLE "EmailSend" DROP COLUMN IF EXISTS "enrollmentId";

-- ─── Drop dependent tables first (children before parents) ──────────────────
DROP TABLE IF EXISTS "ContactSequenceEnrollment" CASCADE;
DROP TABLE IF EXISTS "SequenceStep"              CASCADE;
DROP TABLE IF EXISTS "EmailSequence"             CASCADE;

DROP TABLE IF EXISTS "AutomationRun"    CASCADE;
DROP TABLE IF EXISTS "AutomationAction" CASCADE;
DROP TABLE IF EXISTS "Automation"       CASCADE;

-- ─── Drop legacy enums ──────────────────────────────────────────────────────
DROP TYPE IF EXISTS "EnrollmentStatus";
DROP TYPE IF EXISTS "SequenceStatus";
DROP TYPE IF EXISTS "AutomationRunStatus";
DROP TYPE IF EXISTS "ActionType";
DROP TYPE IF EXISTS "TriggerType";
DROP TYPE IF EXISTS "AutomationStatus";
