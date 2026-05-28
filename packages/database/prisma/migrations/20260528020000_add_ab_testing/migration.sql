-- A/B testing for funnel steps (Phase 2).

-- AlterTable: per-step A/B toggle.
ALTER TABLE "FunnelStep" ADD COLUMN "abTestActive" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: step variants (control + challengers).
CREATE TABLE "StepVariant" (
    "id"        TEXT NOT NULL,
    "stepId"    TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "pageJson"  JSONB NOT NULL,
    "weight"    INTEGER NOT NULL DEFAULT 50,
    "isControl" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StepVariant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StepVariant_stepId_idx" ON "StepVariant"("stepId");

ALTER TABLE "StepVariant" ADD CONSTRAINT "StepVariant_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "FunnelStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;
