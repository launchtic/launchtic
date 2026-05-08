-- CreateTable
CREATE TABLE "SavedBlock" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "contentJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedBlock_workspaceId_kind_idx" ON "SavedBlock"("workspaceId", "kind");

-- CreateIndex
CREATE INDEX "SavedBlock_workspaceId_createdAt_idx" ON "SavedBlock"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "SavedBlock" ADD CONSTRAINT "SavedBlock_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
