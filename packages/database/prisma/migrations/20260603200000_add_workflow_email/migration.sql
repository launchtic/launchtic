-- Move SEND_EMAIL content out of workflow.nodes JSON into a first-class
-- WorkflowEmail table. Each row owns subject/body/sender + denormalized
-- send/open/click counters.

CREATE TABLE "WorkflowEmail" (
  "id"          TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "workflowId"  TEXT NOT NULL,

  "name"        TEXT,
  "subject"     TEXT NOT NULL,
  "bodyHtml"    TEXT NOT NULL,
  "fromName"    TEXT NOT NULL,
  "fromEmail"   TEXT NOT NULL,
  "senderId"    TEXT,

  "sentCount"    INTEGER NOT NULL DEFAULT 0,
  "openedCount"  INTEGER NOT NULL DEFAULT 0,
  "clickedCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount"  INTEGER NOT NULL DEFAULT 0,

  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WorkflowEmail_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkflowEmail_workspaceId_idx" ON "WorkflowEmail"("workspaceId");
CREATE INDEX "WorkflowEmail_workflowId_idx"  ON "WorkflowEmail"("workflowId");

ALTER TABLE "WorkflowEmail"
  ADD CONSTRAINT "WorkflowEmail_workflowId_fkey"
  FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Link EmailSend rows produced by workflow SEND_EMAIL nodes to the
-- WorkflowEmail they came from. Used by email_opened / email_clicked
-- conditions with source="workflow_email".
ALTER TABLE "EmailSend"
  ADD COLUMN "workflowEmailId" TEXT;

CREATE INDEX "EmailSend_contactId_workflowEmailId_openedAt_idx"
  ON "EmailSend"("contactId", "workflowEmailId", "openedAt");

CREATE INDEX "EmailSend_contactId_workflowEmailId_clickedAt_idx"
  ON "EmailSend"("contactId", "workflowEmailId", "clickedAt");

ALTER TABLE "EmailSend"
  ADD CONSTRAINT "EmailSend_workflowEmailId_fkey"
  FOREIGN KEY ("workflowEmailId") REFERENCES "WorkflowEmail"("id") ON DELETE SET NULL ON UPDATE CASCADE;
