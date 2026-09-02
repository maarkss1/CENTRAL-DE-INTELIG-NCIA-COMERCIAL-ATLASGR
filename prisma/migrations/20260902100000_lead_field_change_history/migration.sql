-- CLOSEDATE Intelligence + Handoffs (Central de Inteligência Comercial): histórico estruturado
-- de mudança de campo de uma oportunidade. Antes desta migration, nenhuma alteração de
-- `Lead.expectedCloseAt` (data prevista de fechamento) nem de `Lead.owner` (responsável) deixava
-- rastro consultável — TimelineEvent é texto livre ("Dados do lead atualizados"), então era
-- impossível medir adiamentos, antecipações, dias deslocados ou trocas de responsável.
-- Append-only (nunca sobrescrito), gravado por src/shared/services/
-- leadFieldChangeHistory.service.ts nos pontos de escrita reais que já alteram esses campos. Histórico
-- anterior a esta migration não existe e os relatórios expõem isso como "sem histórico".
CREATE TABLE "LeadFieldChange" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "previousValue" TEXT,
    "newValue" TEXT,
    "changedBy" TEXT,
    "source" TEXT NOT NULL DEFAULT 'crm',
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadFieldChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LeadFieldChange_organizationId_field_changedAt_idx" ON "LeadFieldChange"("organizationId", "field", "changedAt");
CREATE INDEX "LeadFieldChange_organizationId_leadId_field_idx" ON "LeadFieldChange"("organizationId", "leadId", "field");
CREATE INDEX "LeadFieldChange_leadId_changedAt_idx" ON "LeadFieldChange"("leadId", "changedAt");

ALTER TABLE "LeadFieldChange"
    ADD CONSTRAINT "LeadFieldChange_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeadFieldChange"
    ADD CONSTRAINT "LeadFieldChange_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS — padrão "fora do allowlist de bypass" (migration 20260825120000): leitura E escrita exigem
-- o tenant da requisição; nenhuma cláusula de bypass_rls, porque toda escrita acontece dentro de
-- uma requisição já autenticada (mesmo perfil de LeadStageHistory após aquela migration).
ALTER TABLE "LeadFieldChange" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeadFieldChange" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "LeadFieldChange" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);
