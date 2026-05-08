-- AlterTable
ALTER TABLE "PageTemplate" ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "PageTemplate_type_isDefault_idx" ON "PageTemplate"("type", "isDefault");
