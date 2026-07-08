-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "pinned" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Asset_workspaceId_pinned_idx" ON "Asset"("workspaceId", "pinned");
