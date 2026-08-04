ALTER TABLE "Lead" ADD COLUMN "bitrixDealId" TEXT;
CREATE INDEX "Lead_bitrixDealId_idx" ON "Lead"("bitrixDealId");
