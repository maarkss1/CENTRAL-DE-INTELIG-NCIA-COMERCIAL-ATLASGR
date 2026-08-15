-- Onda 6, Agente 01A: schema de histórico de extrações Bitrix (BitrixExtractionRun), destravado
-- da decisão humana de janela de retenção pendente há 5 ondas (ver
-- .agents/handoffs/onda-1/06-para-01-schema-extracoes-bitrix-historico.md e
-- .agents/handoffs/onda-6/01A-para-06-bitrix-extraction-run-schema.md). A janela em si NÃO é
-- gravada aqui — é lida em runtime de `BITRIX_EXTRACTION_RETENTION_DAYS` (src/config/env.ts,
-- default 90 dias, mesmo padrão do worker de anonimização de leads desqualificados). O worker de
-- expurgo correspondente fica desligado por padrão (`BITRIX_EXTRACTION_PURGE_ENABLED=false`).

-- CreateEnum
CREATE TYPE "BitrixExtractionStatus" AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "BitrixExtractionRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT,
    "requestedBy" TEXT,
    "entities" TEXT[],
    "fields" JSONB NOT NULL,
    "filters" JSONB NOT NULL,
    "status" "BitrixExtractionStatus" NOT NULL DEFAULT 'queued',
    "progress" JSONB,
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "countByEntity" JSONB,
    "errorMessage" TEXT,
    "correlationId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "files" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BitrixExtractionRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BitrixExtractionRun_organizationId_createdAt_idx" ON "BitrixExtractionRun"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "BitrixExtractionRun_connectionId_idx" ON "BitrixExtractionRun"("connectionId");

-- CreateIndex
CREATE INDEX "BitrixExtractionRun_status_idx" ON "BitrixExtractionRun"("status");

-- AddForeignKey
ALTER TABLE "BitrixExtractionRun" ADD CONSTRAINT "BitrixExtractionRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BitrixExtractionRun" ADD CONSTRAINT "BitrixExtractionRun_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "BitrixConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS: mesmo padrão de tenant_isolation_policy usado em toda a base (ver
-- 20260722020322_enable_rls, 20260807100000_enable_rls_remaining_tables). WITH CHECK(true) porque
-- o worker de extração roda fora do ciclo normal de request (BullMQ), mesmo motivo documentado
-- nessas migrations anteriores: a extensão do Prisma só intercepta chamadas de model, não
-- $queryRaw, e a escrita legítima do worker pode acontecer sem app.current_tenant_id setado numa
-- transação sem contexto explícito — a defesa real aqui é o app sempre gravar organizationId a
-- partir do tenant que disparou a extração, nunca aceito de payload externo.
ALTER TABLE "BitrixExtractionRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BitrixExtractionRun" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "BitrixExtractionRun" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
)
WITH CHECK (true);
