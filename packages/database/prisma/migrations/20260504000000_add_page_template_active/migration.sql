-- AlterTable
ALTER TABLE "PageTemplate" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "PageTemplate_isActive_idx" ON "PageTemplate"("isActive");
