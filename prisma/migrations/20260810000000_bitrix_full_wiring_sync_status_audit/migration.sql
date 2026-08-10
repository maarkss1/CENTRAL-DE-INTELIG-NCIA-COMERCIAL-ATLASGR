-- Remediação da auditoria BITRIX24-LEAD-FLOW-AUDIT.md: campo customizado (UF_CRM_*) de contrato,
-- status de sincronização outbound visível por lead, segredo do webhook de entrada, erro da
-- última execução da regra automática, trilha de auditoria por operação de sync, e constraint de
-- unicidade que fecha a janela de corrida de duplicidade em import/export concorrente.

-- AlterTable
ALTER TABLE "BitrixConnection" ADD COLUMN     "inboundEventsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "webhookSecret" TEXT;

-- AlterTable
ALTER TABLE "BitrixSyncRule" ADD COLUMN     "lastError" TEXT;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "bitrixSyncError" TEXT,
ADD COLUMN     "bitrixSyncStatus" TEXT,
ADD COLUMN     "bitrixSyncedAt" TIMESTAMP(3),
ADD COLUMN     "contractSignedDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "BitrixSyncLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT,
    "direction" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "leadId" TEXT,
    "bitrixRecordId" TEXT,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BitrixSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BitrixSyncLog_organizationId_createdAt_idx" ON "BitrixSyncLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "BitrixSyncLog_leadId_idx" ON "BitrixSyncLog"("leadId");

-- CreateIndex
CREATE INDEX "BitrixSyncLog_connectionId_createdAt_idx" ON "BitrixSyncLog"("connectionId", "createdAt");

-- CreateIndex (unicidade condicional na prática: NULL não colide com NULL no Postgres, então só
-- passa a valer quando duas linhas da MESMA organização têm o MESMO bitrixLeadId/bitrixDealId
-- não-nulo — exatamente o cenário de corrida que motivou esta migração).
CREATE UNIQUE INDEX "Lead_organizationId_bitrixLeadId_key" ON "Lead"("organizationId", "bitrixLeadId");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_organizationId_bitrixDealId_key" ON "Lead"("organizationId", "bitrixDealId");

-- AddForeignKey
ALTER TABLE "BitrixSyncLog" ADD CONSTRAINT "BitrixSyncLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BitrixSyncLog" ADD CONSTRAINT "BitrixSyncLog_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "BitrixConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
