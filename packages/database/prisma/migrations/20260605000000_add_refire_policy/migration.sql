-- Add reFirePolicy column to Workflow.
--   "every" → fire on every event (default). SINGLE_ACTIVE guard still
--             blocks concurrent runs; after COMPLETED the contact re-enrolls.
--   "once"  → fire ONCE per contact ever. Block enroll if ANY previous run
--             exists for (workflow, contact). Used for welcome / lead-magnet
--             flows where re-firing on every event would spam the contact.
--
-- All existing rows default to "every" — preserves current behavior. Operators
-- explicitly opt into "once" via the workflow builder UI; templates ship with
-- the appropriate policy pre-set (FORM_SUBMIT welcome series default to
-- "once" once a from-template clone runs after this migration).

ALTER TABLE "Workflow" ADD COLUMN "reFirePolicy" TEXT NOT NULL DEFAULT 'every';
