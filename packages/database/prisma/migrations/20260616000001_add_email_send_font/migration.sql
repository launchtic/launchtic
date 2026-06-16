-- Snapshot the email font at send time (audit + re-render of legacy rows).
ALTER TABLE "EmailSend" ADD COLUMN "font" TEXT;
