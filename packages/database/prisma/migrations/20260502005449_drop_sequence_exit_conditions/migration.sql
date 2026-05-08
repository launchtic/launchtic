/*
  Warnings:

  - You are about to drop the column `exitOnPurchase` on the `EmailSequence` table. All the data in the column will be lost.
  - You are about to drop the column `exitOnTagId` on the `EmailSequence` table. All the data in the column will be lost.
  - You are about to drop the column `exitOnUnsubscribe` on the `EmailSequence` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "ActionType" ADD VALUE 'END_SEQUENCE';

-- AlterTable
ALTER TABLE "EmailSequence" DROP COLUMN "exitOnPurchase",
DROP COLUMN "exitOnTagId",
DROP COLUMN "exitOnUnsubscribe";
