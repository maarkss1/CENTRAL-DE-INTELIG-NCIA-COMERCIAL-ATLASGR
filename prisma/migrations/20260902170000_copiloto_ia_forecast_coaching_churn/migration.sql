-- AlterTable
ALTER TABLE "CopilotoDealHealthSnapshot" ADD COLUMN     "churnFactorsJson" JSONB,
ADD COLUMN     "churnRiskScore" INTEGER,
ADD COLUMN     "forecastProbabilityAi" INTEGER,
ADD COLUMN     "forecastReasons" TEXT[];

-- CreateTable
CREATE TABLE "CopilotoCoachingEvaluation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "rubricJson" JSONB NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CopilotoCoachingEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CopilotoCoachingEvaluation_conversationId_key" ON "CopilotoCoachingEvaluation"("conversationId");

-- CreateIndex
CREATE INDEX "CopilotoCoachingEvaluation_organizationId_createdAt_idx" ON "CopilotoCoachingEvaluation"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "CopilotoCoachingEvaluation" ADD CONSTRAINT "CopilotoCoachingEvaluation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopilotoCoachingEvaluation" ADD CONSTRAINT "CopilotoCoachingEvaluation_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "CopilotoConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
