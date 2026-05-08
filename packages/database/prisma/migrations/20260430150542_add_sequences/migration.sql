-- CreateEnum
CREATE TYPE "SequenceStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'EXITED', 'FAILED');

-- DropIndex
DROP INDEX "Contact_email_trgm_idx";

-- DropIndex
DROP INDEX "EmailSend_subject_trgm_idx";

-- DropIndex
DROP INDEX "EmailSend_toEmail_trgm_idx";

-- AlterTable
ALTER TABLE "EmailSend" ADD COLUMN     "enrollmentId" TEXT,
ADD COLUMN     "sequenceId" TEXT,
ADD COLUMN     "sequenceStepId" TEXT;

-- CreateTable
CREATE TABLE "EmailSequence" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "SequenceStatus" NOT NULL DEFAULT 'DRAFT',
    "exitOnUnsubscribe" BOOLEAN NOT NULL DEFAULT true,
    "exitOnPurchase" BOOLEAN NOT NULL DEFAULT false,
    "exitOnTagId" TEXT,
    "totalEnrolled" INTEGER NOT NULL DEFAULT 0,
    "activeCount" INTEGER NOT NULL DEFAULT 0,
    "completedCount" INTEGER NOT NULL DEFAULT 0,
    "exitedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SequenceStep" (
    "id" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "delayMinutes" INTEGER NOT NULL DEFAULT 0,
    "emailTemplateId" TEXT,
    "emailSubject" TEXT NOT NULL,
    "emailHtmlBody" TEXT NOT NULL,
    "emailFromName" TEXT,
    "emailFromEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SequenceStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactSequenceEnrollment" (
    "id" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentStepIndex" INTEGER NOT NULL DEFAULT 0,
    "nextSendAt" TIMESTAMP(3) NOT NULL,
    "exitReason" TEXT,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "lastSentAt" TIMESTAMP(3),
    "enrolledByAutomationId" TEXT,
    "enrolledByRunId" TEXT,

    CONSTRAINT "ContactSequenceEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailSequence_workspaceId_status_idx" ON "EmailSequence"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "SequenceStep_sequenceId_order_idx" ON "SequenceStep"("sequenceId", "order");

-- CreateIndex
CREATE INDEX "ContactSequenceEnrollment_status_nextSendAt_idx" ON "ContactSequenceEnrollment"("status", "nextSendAt");

-- CreateIndex
CREATE INDEX "ContactSequenceEnrollment_sequenceId_status_idx" ON "ContactSequenceEnrollment"("sequenceId", "status");

-- CreateIndex
CREATE INDEX "ContactSequenceEnrollment_contactId_status_idx" ON "ContactSequenceEnrollment"("contactId", "status");

-- CreateIndex
CREATE INDEX "ContactSequenceEnrollment_workspaceId_status_idx" ON "ContactSequenceEnrollment"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "EmailSend_sequenceId_idx" ON "EmailSend"("sequenceId");

-- CreateIndex
CREATE INDEX "EmailSend_enrollmentId_idx" ON "EmailSend"("enrollmentId");

-- AddForeignKey
ALTER TABLE "EmailSend" ADD CONSTRAINT "EmailSend_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "EmailSequence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSend" ADD CONSTRAINT "EmailSend_sequenceStepId_fkey" FOREIGN KEY ("sequenceStepId") REFERENCES "SequenceStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSend" ADD CONSTRAINT "EmailSend_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "ContactSequenceEnrollment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSequence" ADD CONSTRAINT "EmailSequence_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceStep" ADD CONSTRAINT "SequenceStep_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "EmailSequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceStep" ADD CONSTRAINT "SequenceStep_emailTemplateId_fkey" FOREIGN KEY ("emailTemplateId") REFERENCES "EmailTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactSequenceEnrollment" ADD CONSTRAINT "ContactSequenceEnrollment_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "EmailSequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactSequenceEnrollment" ADD CONSTRAINT "ContactSequenceEnrollment_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactSequenceEnrollment" ADD CONSTRAINT "ContactSequenceEnrollment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
