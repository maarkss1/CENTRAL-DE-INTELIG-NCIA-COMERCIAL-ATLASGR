-- CreateEnum
CREATE TYPE "CopilotoConversationSource" AS ENUM ('MEET', 'CALL', 'WHATSAPP', 'MANUAL', 'OTHER');

-- CreateEnum
CREATE TYPE "CopilotoConversationStatus" AS ENUM ('SCHEDULED', 'CAPTURING', 'PROCESSING', 'READY', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CopilotoConsentStatus" AS ENUM ('PENDING', 'GRANTED', 'DECLINED', 'NOT_REQUIRED');

-- CreateEnum
CREATE TYPE "CopilotoCrmEntityType" AS ENUM ('LEAD', 'COMPANY', 'CONTACT');

-- CreateEnum
CREATE TYPE "CopilotoSuggestionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WRITTEN_BACK', 'FAILED');

-- CreateTable
CREATE TABLE "CopilotoConversation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "source" "CopilotoConversationSource" NOT NULL,
    "status" "CopilotoConversationStatus" NOT NULL DEFAULT 'SCHEDULED',
    "title" TEXT,
    "externalMeetingId" TEXT,
    "leadId" TEXT,
    "companyId" TEXT,
    "contactId" TEXT,
    "consentStatus" "CopilotoConsentStatus" NOT NULL DEFAULT 'PENDING',
    "createdBy" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "deleteReason" TEXT,

    CONSTRAINT "CopilotoConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CopilotoTranscriptSegment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "speakerLabel" TEXT,
    "startMs" INTEGER NOT NULL,
    "endMs" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CopilotoTranscriptSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CopilotoInsight" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "valueJson" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION,
    "evidenceSegmentIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CopilotoInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CopilotoCrmFieldSuggestion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "entityType" "CopilotoCrmEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "fieldCode" TEXT NOT NULL,
    "previousValue" TEXT,
    "suggestedValue" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "status" "CopilotoSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "writebackAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CopilotoCrmFieldSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CopilotoDealHealthSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "factorsJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CopilotoDealHealthSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CopilotoConsentRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "textVersion" TEXT NOT NULL,
    "actorId" TEXT,
    "grantedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CopilotoConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CopilotoConversation_organizationId_status_idx" ON "CopilotoConversation"("organizationId", "status");

-- CreateIndex
CREATE INDEX "CopilotoConversation_organizationId_createdAt_idx" ON "CopilotoConversation"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "CopilotoConversation_leadId_idx" ON "CopilotoConversation"("leadId");

-- CreateIndex
CREATE INDEX "CopilotoConversation_companyId_idx" ON "CopilotoConversation"("companyId");

-- CreateIndex
CREATE INDEX "CopilotoConversation_contactId_idx" ON "CopilotoConversation"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "CopilotoConversation_organizationId_externalMeetingId_key" ON "CopilotoConversation"("organizationId", "externalMeetingId");

-- CreateIndex
CREATE INDEX "CopilotoTranscriptSegment_organizationId_idx" ON "CopilotoTranscriptSegment"("organizationId");

-- CreateIndex
CREATE INDEX "CopilotoTranscriptSegment_conversationId_startMs_idx" ON "CopilotoTranscriptSegment"("conversationId", "startMs");

-- CreateIndex
CREATE INDEX "CopilotoInsight_organizationId_idx" ON "CopilotoInsight"("organizationId");

-- CreateIndex
CREATE INDEX "CopilotoInsight_conversationId_type_idx" ON "CopilotoInsight"("conversationId", "type");

-- CreateIndex
CREATE INDEX "CopilotoCrmFieldSuggestion_organizationId_status_idx" ON "CopilotoCrmFieldSuggestion"("organizationId", "status");

-- CreateIndex
CREATE INDEX "CopilotoCrmFieldSuggestion_conversationId_idx" ON "CopilotoCrmFieldSuggestion"("conversationId");

-- CreateIndex
CREATE INDEX "CopilotoCrmFieldSuggestion_organizationId_entityType_entity_idx" ON "CopilotoCrmFieldSuggestion"("organizationId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "CopilotoDealHealthSnapshot_organizationId_leadId_createdAt_idx" ON "CopilotoDealHealthSnapshot"("organizationId", "leadId", "createdAt");

-- CreateIndex
CREATE INDEX "CopilotoDealHealthSnapshot_leadId_idx" ON "CopilotoDealHealthSnapshot"("leadId");

-- CreateIndex
CREATE INDEX "CopilotoConsentRecord_organizationId_idx" ON "CopilotoConsentRecord"("organizationId");

-- CreateIndex
CREATE INDEX "CopilotoConsentRecord_conversationId_idx" ON "CopilotoConsentRecord"("conversationId");

-- AddForeignKey
ALTER TABLE "CopilotoConversation" ADD CONSTRAINT "CopilotoConversation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopilotoConversation" ADD CONSTRAINT "CopilotoConversation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopilotoConversation" ADD CONSTRAINT "CopilotoConversation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopilotoConversation" ADD CONSTRAINT "CopilotoConversation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopilotoTranscriptSegment" ADD CONSTRAINT "CopilotoTranscriptSegment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopilotoTranscriptSegment" ADD CONSTRAINT "CopilotoTranscriptSegment_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "CopilotoConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopilotoInsight" ADD CONSTRAINT "CopilotoInsight_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopilotoInsight" ADD CONSTRAINT "CopilotoInsight_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "CopilotoConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopilotoCrmFieldSuggestion" ADD CONSTRAINT "CopilotoCrmFieldSuggestion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopilotoCrmFieldSuggestion" ADD CONSTRAINT "CopilotoCrmFieldSuggestion_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "CopilotoConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopilotoDealHealthSnapshot" ADD CONSTRAINT "CopilotoDealHealthSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopilotoDealHealthSnapshot" ADD CONSTRAINT "CopilotoDealHealthSnapshot_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopilotoConsentRecord" ADD CONSTRAINT "CopilotoConsentRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopilotoConsentRecord" ADD CONSTRAINT "CopilotoConsentRecord_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "CopilotoConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
