-- Um registro por execução da campanha de prospecção fria (coldCall.service.ts).
--
-- Sem esta tabela a campanha roda 100% invisível: só `logger.info`, sem nenhuma tela para a
-- operação ver quantos leads foram discados, quantos pulados e por quê. A escrita acontece de
-- dentro do worker do BullMQ (sem request HTTP), sob requestContext.run({ tenantId }) — mesmo
-- mecanismo que CallSuppression já usa — então a política de RLS abaixo segue o mesmo padrão.

CREATE TABLE "ColdCallRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "scanned" INTEGER NOT NULL,
    "called" INTEGER NOT NULL,
    "skippedMaxAttempts" INTEGER NOT NULL DEFAULT 0,
    "skippedCooldown" INTEGER NOT NULL DEFAULT 0,
    "skippedNoPhone" INTEGER NOT NULL DEFAULT 0,
    "skippedSuppressed" INTEGER NOT NULL DEFAULT 0,
    "skippedError" INTEGER NOT NULL DEFAULT 0,
    "haltedBy" TEXT,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ColdCallRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ColdCallRun_organizationId_runAt_idx" ON "ColdCallRun"("organizationId", "runAt");

ALTER TABLE "ColdCallRun"
    ADD CONSTRAINT "ColdCallRun_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ColdCallRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ColdCallRun" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "ColdCallRun" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
);
