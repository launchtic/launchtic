-- AlterTable
ALTER TABLE "PageTemplate" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "PageTemplate_tags_idx" ON "PageTemplate" USING GIN ("tags");
