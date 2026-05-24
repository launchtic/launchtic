-- DropColumn: storage now lives on Organization (shared by all workspaces).
-- Data was backfilled to Organization.storage in migration 20260524020138.
ALTER TABLE "WorkspaceSettings" DROP COLUMN "storage";
