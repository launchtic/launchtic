/*
  Warnings:

  - You are about to drop the column `textBody` on the `Broadcast` table. All the data in the column will be lost.
  - You are about to drop the column `textBody` on the `EmailTemplate` table. All the data in the column will be lost.
  - Made the column `fromName` on table `Broadcast` required. This step will fail if there are existing NULL values in that column.
  - Made the column `fromEmail` on table `Broadcast` required. This step will fail if there are existing NULL values in that column.
  - Made the column `emailFromName` on table `SequenceStep` required. This step will fail if there are existing NULL values in that column.
  - Made the column `emailFromEmail` on table `SequenceStep` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Broadcast" DROP COLUMN "textBody",
ALTER COLUMN "fromName" SET NOT NULL,
ALTER COLUMN "fromEmail" SET NOT NULL;

-- AlterTable
ALTER TABLE "EmailTemplate" DROP COLUMN "textBody";

-- AlterTable
ALTER TABLE "SequenceStep" ALTER COLUMN "emailFromName" SET NOT NULL,
ALTER COLUMN "emailFromEmail" SET NOT NULL;
