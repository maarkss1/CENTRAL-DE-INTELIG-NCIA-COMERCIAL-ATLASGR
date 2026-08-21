-- AlterTable
ALTER TABLE "EnrichmentLog" ADD COLUMN "dataOrigin" TEXT;
ALTER TABLE "EnrichmentLog" ADD COLUMN "appliedToCompany" BOOLEAN;

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN "aiProcessingConsent" BOOLEAN;

-- CreateTable
CREATE TABLE "ThreeCXCallEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT,
    "extension" TEXT,
    "callId" TEXT,
    "eventType" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThreeCXCallEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ThreeCXCallEvent_organizationId_createdAt_idx" ON "ThreeCXCallEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ThreeCXCallEvent_organizationId_callId_eventType_key" ON "ThreeCXCallEvent"("organizationId", "callId", "eventType");

-- AddForeignKey
ALTER TABLE "ThreeCXCallEvent" ADD CONSTRAINT "ThreeCXCallEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
