-- Funnel analytics event log (Phase 0 foundation).

-- CreateEnum
CREATE TYPE "FunnelEventType" AS ENUM ('VIEW', 'LEAD', 'PURCHASE');

-- CreateTable
CREATE TABLE "FunnelEvent" (
    "id"          TEXT NOT NULL,
    "funnelId"    TEXT NOT NULL,
    "stepId"      TEXT NOT NULL,
    "type"        "FunnelEventType" NOT NULL,
    "sessionId"   TEXT NOT NULL,
    "variantId"   TEXT,
    "contactId"   TEXT,
    "orderId"     TEXT,
    "amountCents" INTEGER,
    "ip"          TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FunnelEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FunnelEvent_funnelId_type_createdAt_idx" ON "FunnelEvent"("funnelId", "type", "createdAt");
CREATE INDEX "FunnelEvent_stepId_variantId_idx" ON "FunnelEvent"("stepId", "variantId");
CREATE INDEX "FunnelEvent_sessionId_idx" ON "FunnelEvent"("sessionId");

-- AddForeignKey
ALTER TABLE "FunnelEvent" ADD CONSTRAINT "FunnelEvent_funnelId_fkey" FOREIGN KEY ("funnelId") REFERENCES "Funnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
