-- Lista interna de bloqueio de discagem (opt-out) do SDR de voz.
--
-- Sem esta tabela o opt-out não tem onde ser gravado: o pedido "não me liguem mais" ficava apenas
-- como texto na observação da atividade, e a próxima execução da campanha ligava de novo.

CREATE TABLE "CallSuppression" (
    "id" TEXT NOT NULL,
    -- Normalizado em E.164 na aplicação antes de gravar; é a chave real do bloqueio.
    "phoneE164" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "reason" TEXT,
    "leadId" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallSuppression_pkey" PRIMARY KEY ("id")
);

-- Único por (tenant, número): torna o registro do opt-out idempotente, já que o Birth Voices Hub
-- reentrega o webhook até receber 2xx.
CREATE UNIQUE INDEX "CallSuppression_organizationId_phoneE164_key"
    ON "CallSuppression"("organizationId", "phoneE164");

CREATE INDEX "CallSuppression_organizationId_idx" ON "CallSuppression"("organizationId");

ALTER TABLE "CallSuppression"
    ADD CONSTRAINT "CallSuppression_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL e não CASCADE: apagar o lead não pode reabilitar a discagem para quem pediu opt-out.
ALTER TABLE "CallSuppression"
    ADD CONSTRAINT "CallSuppression_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS no mesmo padrão das demais tabelas com tenant.
ALTER TABLE "CallSuppression" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CallSuppression" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "CallSuppression" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
);
