-- CreateEnum
CREATE TYPE "EmailTemplateCategory" AS ENUM ('TRANSACTIONAL', 'MARKETING', 'SYSTEM');

-- CreateEnum
CREATE TYPE "BroadcastStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "BroadcastTarget" AS ENUM ('ALL_CONTACTS', 'TAG', 'SEGMENT');

-- CreateEnum
CREATE TYPE "EmailSendStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'BOUNCED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EventType" ADD VALUE 'EMAIL_SENT';
ALTER TYPE "EventType" ADD VALUE 'EMAIL_OPENED';
ALTER TYPE "EventType" ADD VALUE 'EMAIL_CLICKED';
ALTER TYPE "EventType" ADD VALUE 'EMAIL_BOUNCED';
ALTER TYPE "EventType" ADD VALUE 'EMAIL_UNSUBSCRIBED';

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "bouncedAt" TIMESTAMP(3),
ADD COLUMN     "consentSource" TEXT,
ADD COLUMN     "consentedAt" TIMESTAMP(3),
ADD COLUMN     "unsubscribedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "OrderBumpPricePlan" ADD COLUMN     "paypalPlanId" TEXT;

-- AlterTable
ALTER TABLE "StepPricePlan" ADD COLUMN     "paypalPlanId" TEXT;

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "htmlBody" TEXT NOT NULL,
    "textBody" TEXT,
    "category" "EmailTemplateCategory" NOT NULL DEFAULT 'MARKETING',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "systemKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Broadcast" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "htmlBody" TEXT NOT NULL,
    "textBody" TEXT,
    "templateId" TEXT,
    "fromName" TEXT,
    "fromEmail" TEXT,
    "status" "BroadcastStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "targetType" "BroadcastTarget" NOT NULL DEFAULT 'ALL_CONTACTS',
    "targetTagIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludeUnsubscribed" BOOLEAN NOT NULL DEFAULT true,
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSend" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contactId" TEXT,
    "toEmail" TEXT NOT NULL,
    "broadcastId" TEXT,
    "templateId" TEXT,
    "transactionalKey" TEXT,
    "subject" TEXT NOT NULL,
    "status" "EmailSendStatus" NOT NULL DEFAULT 'QUEUED',
    "errorMessage" TEXT,
    "providerMessageId" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),

    CONSTRAINT "EmailSend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailTemplate_workspaceId_category_idx" ON "EmailTemplate"("workspaceId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_workspaceId_systemKey_key" ON "EmailTemplate"("workspaceId", "systemKey");

-- CreateIndex
CREATE INDEX "Broadcast_workspaceId_status_idx" ON "Broadcast"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Broadcast_scheduledAt_status_idx" ON "Broadcast"("scheduledAt", "status");

-- CreateIndex
CREATE INDEX "EmailSend_workspaceId_status_queuedAt_idx" ON "EmailSend"("workspaceId", "status", "queuedAt");

-- CreateIndex
CREATE INDEX "EmailSend_contactId_queuedAt_idx" ON "EmailSend"("contactId", "queuedAt");

-- CreateIndex
CREATE INDEX "EmailSend_broadcastId_idx" ON "EmailSend"("broadcastId");

-- AddForeignKey
ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EmailTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSend" ADD CONSTRAINT "EmailSend_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSend" ADD CONSTRAINT "EmailSend_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSend" ADD CONSTRAINT "EmailSend_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "Broadcast"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSend" ADD CONSTRAINT "EmailSend_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EmailTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
