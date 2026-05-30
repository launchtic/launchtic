-- Workflows: graph-based automation (Phase 1 of automation refactor).
-- Adds Workflow / WorkflowRun / WorkflowRunStep + enums. Legacy Automation
-- and EmailSequence models stay untouched — coexistence period through
-- Phase 1A/1B until visual builder ships, then Phase 1C will drop legacy.

CREATE TYPE "WorkflowStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');
CREATE TYPE "WorkflowRunStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'EXITED', 'FAILED');

CREATE TABLE "Workflow" (
  "id"                   TEXT NOT NULL,
  "workspaceId"          TEXT NOT NULL,
  "name"                 TEXT NOT NULL,
  "description"          TEXT,
  "status"               "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
  "triggerType"          TEXT NOT NULL,
  "triggerConfig"        JSONB,
  "nodes"                JSONB NOT NULL,
  "edges"                JSONB NOT NULL,
  "startNodeId"          TEXT,
  "reEnrollPolicy"       TEXT NOT NULL DEFAULT 'SINGLE_ACTIVE',
  "reEnrollCooldownDays" INTEGER,
  "maxDurationDays"      INTEGER,
  "totalEnrolled"        INTEGER NOT NULL DEFAULT 0,
  "activeCount"          INTEGER NOT NULL DEFAULT 0,
  "completedCount"       INTEGER NOT NULL DEFAULT 0,
  "exitedCount"          INTEGER NOT NULL DEFAULT 0,
  "failedCount"          INTEGER NOT NULL DEFAULT 0,
  "lastTriggeredAt"      TIMESTAMP(3),
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Workflow_workspaceId_status_triggerType_idx"
  ON "Workflow"("workspaceId", "status", "triggerType");
CREATE INDEX "Workflow_workspaceId_createdAt_idx"
  ON "Workflow"("workspaceId", "createdAt");

ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WorkflowRun" (
  "id"            TEXT NOT NULL,
  "workflowId"    TEXT NOT NULL,
  "workspaceId"   TEXT NOT NULL,
  "contactId"     TEXT,
  "status"        "WorkflowRunStatus" NOT NULL DEFAULT 'ACTIVE',
  "currentNodeId" TEXT,
  "scheduledFor"  TIMESTAMP(3),
  "triggerData"   JSONB NOT NULL DEFAULT '{}',
  "context"       JSONB NOT NULL DEFAULT '{}',
  "exitReason"    TEXT,
  "startedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt"   TIMESTAMP(3),
  CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkflowRun_workflowId_status_idx"   ON "WorkflowRun"("workflowId", "status");
CREATE INDEX "WorkflowRun_workspaceId_status_idx" ON "WorkflowRun"("workspaceId", "status");
CREATE INDEX "WorkflowRun_contactId_idx"           ON "WorkflowRun"("contactId");
CREATE INDEX "WorkflowRun_status_scheduledFor_idx" ON "WorkflowRun"("status", "scheduledFor");

ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_workflowId_fkey"
  FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "WorkflowRunStep" (
  "id"          TEXT NOT NULL,
  "runId"       TEXT NOT NULL,
  "nodeId"      TEXT NOT NULL,
  "nodeType"    TEXT NOT NULL,
  "status"      TEXT NOT NULL,
  "startedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "error"       TEXT,
  "output"      JSONB,
  CONSTRAINT "WorkflowRunStep_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkflowRunStep_runId_startedAt_idx" ON "WorkflowRunStep"("runId", "startedAt");
CREATE INDEX "WorkflowRunStep_runId_nodeId_idx"    ON "WorkflowRunStep"("runId", "nodeId");

ALTER TABLE "WorkflowRunStep" ADD CONSTRAINT "WorkflowRunStep_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "WorkflowRun"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
