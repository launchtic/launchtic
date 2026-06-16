-- Font is now stored in the email body (Craft Page.fontFamily), not a column.
ALTER TABLE "EmailTemplate" DROP COLUMN "font";
ALTER TABLE "Broadcast" DROP COLUMN "font";
ALTER TABLE "WorkflowEmail" DROP COLUMN "font";
ALTER TABLE "EmailSend" DROP COLUMN "font";
