-- Drop re-enrollment policy columns: Workflow now always behaves as
-- SINGLE_ACTIVE (a contact with an in-flight run is blocked from re-enrolling
-- until that run ends). Operators that previously picked ALWAYS or COOLDOWN
-- will see the SINGLE_ACTIVE behavior after this migration runs.

ALTER TABLE "Workflow" DROP COLUMN "reEnrollPolicy";
ALTER TABLE "Workflow" DROP COLUMN "reEnrollCooldownDays";
