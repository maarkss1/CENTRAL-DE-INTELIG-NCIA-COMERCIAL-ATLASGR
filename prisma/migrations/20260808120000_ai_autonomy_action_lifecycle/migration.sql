-- Evolui AIPendingAction de uma caixa de rascunhos para um ledger auditável de decisões autônomas.
--
-- Esta migration pode encontrar parte do schema já presente em ambientes que receberam um
-- `db push`/hotfix antes do histórico do Prisma ser reconciliado. As operações abaixo são
-- idempotentes para permitir a recuperação via `prisma migrate resolve --rolled-back` sem
-- remover dados ou recriar colunas/índices que já existem.
ALTER TABLE "AIPendingAction"
    ADD COLUMN IF NOT EXISTS "agentRole" TEXT,
    ADD COLUMN IF NOT EXISTS "riskLevel" TEXT NOT NULL DEFAULT 'medium',
    ADD COLUMN IF NOT EXISTS "confidence" DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT,
    ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "discardedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "lastAttemptAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "AIPendingAction"
SET "approvedAt" = CURRENT_TIMESTAMP
WHERE "approved" = TRUE AND "approvedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "AIPendingAction_autonomy_queue_idx"
    ON "AIPendingAction"("organizationId", "discardedAt", "approved", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "AIPendingAction_organizationId_idempotencyKey_key"
    ON "AIPendingAction"("organizationId", "idempotencyKey");
