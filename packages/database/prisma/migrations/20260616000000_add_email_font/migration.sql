-- Per-email web-safe font (template / broadcast / workflow email). NULL = Arial.
ALTER TABLE "EmailTemplate" ADD COLUMN "font" TEXT;
ALTER TABLE "Broadcast" ADD COLUMN "font" TEXT;
ALTER TABLE "WorkflowEmail" ADD COLUMN "font" TEXT;
