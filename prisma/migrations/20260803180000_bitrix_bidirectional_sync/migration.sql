ALTER TABLE "Lead" ADD COLUMN "bitrixLeadId" TEXT;
ALTER TABLE "Lead" ADD COLUMN "bitrixStageLabel" TEXT;
CREATE INDEX "Lead_bitrixLeadId_idx" ON "Lead"("bitrixLeadId");

ALTER TABLE "BitrixConnection" ADD COLUMN "lastImportedAt" TIMESTAMP(3);
