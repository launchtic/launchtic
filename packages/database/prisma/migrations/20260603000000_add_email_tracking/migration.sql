-- Email tracking — open pixel + click redirect.
-- Adds opened/clicked counters to EmailSend + a per-link tracking model.

ALTER TABLE "EmailSend"
  ADD COLUMN "openedAt"   TIMESTAMP(3),
  ADD COLUMN "openCount"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "clickedAt"  TIMESTAMP(3),
  ADD COLUMN "clickCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "EmailSend_contactId_broadcastId_openedAt_idx"  ON "EmailSend"("contactId", "broadcastId", "openedAt");
CREATE INDEX "EmailSend_contactId_broadcastId_clickedAt_idx" ON "EmailSend"("contactId", "broadcastId", "clickedAt");

CREATE TABLE "EmailSendLink" (
  "id"          TEXT NOT NULL,
  "emailSendId" TEXT NOT NULL,
  "token"       TEXT NOT NULL,
  "url"         TEXT NOT NULL,
  "clickedAt"   TIMESTAMP(3),
  "clickCount"  INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "EmailSendLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailSendLink_token_key"        ON "EmailSendLink"("token");
CREATE INDEX        "EmailSendLink_emailSendId_idx"  ON "EmailSendLink"("emailSendId");

ALTER TABLE "EmailSendLink"
  ADD CONSTRAINT "EmailSendLink_emailSendId_fkey"
  FOREIGN KEY ("emailSendId") REFERENCES "EmailSend"("id") ON DELETE CASCADE ON UPDATE CASCADE;
