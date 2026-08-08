-- Evolui AIPendingAction de uma caixa de rascunhos para um ledger auditável de decisões autônomas.
ALTER TABLE "AIPendingAction"
    ADD COLUMN "agentRole" TEXT,
    ADD COLUMN "riskLevel" TEXT NOT NULL DEFAULT 'medium',
    ADD COLUMN "confidence" DOUBLE PRECISION,
    ADD COLUMN "idempotencyKey" TEXT,
    ADD COLUMN "approvedAt" TIMESTAMP(3),
    ADD COLUMN "discardedAt" TIMESTAMP(3),
    ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
    ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "AIPendingAction"
SET "approvedAt" = CURRENT_TIMESTAMP
WHERE "approved" = TRUE AND "approvedAt" IS NULL;

CREATE INDEX "AIPendingAction_autonomy_queue_idx"
    ON "AIPendingAction"("organizationId", "discardedAt", "approved", "createdAt");

CREATE UNIQUE INDEX "AIPendingAction_organizationId_idempotencyKey_key"
    ON "AIPendingAction"("organizationId", "idempotencyKey");
