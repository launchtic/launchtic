-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "productKeys" TEXT[] DEFAULT ARRAY[]::TEXT[];
