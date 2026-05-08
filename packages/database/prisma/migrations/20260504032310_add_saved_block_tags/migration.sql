-- AlterTable
ALTER TABLE "SavedBlock" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "SavedBlock_tags_idx" ON "SavedBlock" USING GIN ("tags");
