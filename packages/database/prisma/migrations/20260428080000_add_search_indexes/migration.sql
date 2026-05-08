-- Enable pg_trgm for fast ILIKE %term% search via GIN indexes.
-- Falls back gracefully if extension already installed.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ContactTag: reverse-lookup index for "all contacts with tag X".
-- Composite PK @@id([contactId, tagId]) only helps "tags of contact X" — we need the inverse.
CREATE INDEX IF NOT EXISTS "ContactTag_tagId_idx" ON "ContactTag"("tagId");

-- Contact search: trigram GIN indexes for ILIKE %query% on email + name + company.
-- Prisma `contains` with `mode: insensitive` translates to ILIKE which uses these.
CREATE INDEX IF NOT EXISTS "Contact_email_trgm_idx"
  ON "Contact" USING gin ("email" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Contact_firstName_trgm_idx"
  ON "Contact" USING gin (COALESCE("firstName", '') gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Contact_lastName_trgm_idx"
  ON "Contact" USING gin (COALESCE("lastName", '') gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Contact_company_trgm_idx"
  ON "Contact" USING gin (COALESCE("company", '') gin_trgm_ops);

-- EmailSend search: same trigram strategy for the logs page.
CREATE INDEX IF NOT EXISTS "EmailSend_toEmail_trgm_idx"
  ON "EmailSend" USING gin ("toEmail" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "EmailSend_subject_trgm_idx"
  ON "EmailSend" USING gin ("subject" gin_trgm_ops);
