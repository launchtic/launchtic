-- Merge the OPTIN and SALES step types into LANDING ("Landing page").
-- They behaved the same; the old distinction is kept as an "optin" / "sales"
-- tag on page templates so template picking (e.g. the AI funnel builder) can
-- still prefer a lead-capture vs a sales layout.

-- 1. Keep the old purpose as a template tag (while the old enum still exists).
UPDATE "PageTemplate" SET "tags" = array_append("tags", 'optin')
  WHERE "type" = 'OPTIN' AND NOT ('optin' = ANY("tags"));
UPDATE "PageTemplate" SET "tags" = array_append("tags", 'sales')
  WHERE "type" = 'SALES' AND NOT ('sales' = ANY("tags"));

-- 2. Swap the enum: new type, convert columns, drop the old one.
CREATE TYPE "StepType_new" AS ENUM ('LANDING', 'CHECKOUT', 'UPSELL', 'DOWNSELL', 'THANKYOU', 'CUSTOM');

ALTER TABLE "FunnelStep" ALTER COLUMN "type" TYPE "StepType_new"
  USING (CASE WHEN "type"::text IN ('OPTIN', 'SALES') THEN 'LANDING' ELSE "type"::text END)::"StepType_new";
ALTER TABLE "PageTemplate" ALTER COLUMN "type" TYPE "StepType_new"
  USING (CASE WHEN "type"::text IN ('OPTIN', 'SALES') THEN 'LANDING' ELSE "type"::text END)::"StepType_new";

DROP TYPE "StepType";
ALTER TYPE "StepType_new" RENAME TO "StepType";

-- 3. Workflow triggers that filter by step type.
UPDATE "Workflow" SET "triggerConfig" = jsonb_set("triggerConfig", '{stepType}', '"LANDING"')
  WHERE "triggerConfig"->>'stepType' IN ('OPTIN', 'SALES');
