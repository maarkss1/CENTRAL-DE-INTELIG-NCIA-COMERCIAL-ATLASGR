-- Onda 40: achado durante o PR de "Lead.savedSearchId" — `SavedSearch` já existe em
-- prisma/schema.prisma (rotas reais em prospecting.routes.ts já leem/escrevem essa tabela em
-- produção) mas NUNCA teve uma migration correspondente no histórico deste repositório — drift
-- pré-existente, não introduzido nesta onda (provavelmente criada via `prisma db push` antes da
-- adoção estrita de migrations aqui). A migration seguinte (20260827150000_...) adiciona uma FK
-- de "Lead" para "SavedSearch" e expôs o gap: um banco criado do zero a partir do histórico de
-- migrations (como o da CI) nunca tinha esta tabela, e a FK falhava com "relation SavedSearch does
-- not exist".
--
-- IF NOT EXISTS em tudo de propósito: inofensiva onde a tabela/índice já existe por drift
-- (produção/qualquer ambiente que já tenha a tabela), cria do zero onde não existe (CI, ambientes
-- novos). Não adiciona RLS aqui — esta tabela nunca teve policy de tenant isolation via migration
-- (mesmo drift), e decidir se/como trazê-la para RLS é uma mudança maior e separada, fora do
-- escopo deste fix pontual de CI.
CREATE TABLE IF NOT EXISTS "SavedSearch" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "criteria" JSONB NOT NULL,
    "schedule" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "leadsDiscovered" INTEGER NOT NULL DEFAULT 0,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedSearch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SavedSearch_organizationId_idx" ON "SavedSearch"("organizationId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'SavedSearch_organizationId_fkey'
    ) THEN
        ALTER TABLE "SavedSearch"
            ADD CONSTRAINT "SavedSearch_organizationId_fkey"
            FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
