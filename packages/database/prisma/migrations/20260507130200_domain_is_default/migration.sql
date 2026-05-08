-- Add Domain.isDefault flag — marks the workspace's PAGES_DOMAIN. Funnels
-- without explicit FunnelDomain assignments are served on this domain.
-- A workspace can have at most one default Domain (partial unique index).

ALTER TABLE "Domain" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- One default per workspace. Postgres partial unique index lets multiple
-- workspaces each have their own default while preventing duplicates within
-- a workspace.
CREATE UNIQUE INDEX "Domain_workspaceId_isDefault_unique"
  ON "Domain" ("workspaceId")
  WHERE "isDefault" = true;
