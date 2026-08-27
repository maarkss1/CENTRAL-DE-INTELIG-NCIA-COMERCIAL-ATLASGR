-- Onda 39 (Agente 04 → Agente 01, handoff
-- .agents/handoffs/onda-39/04-para-01-schema-forecast-snapshot.md): persistência real do
-- snapshot semanal do Forecast (Commit/Best Case/Forecast por período + versão das regras que o
-- gerou). Sem isso, o pilar "Confiabilidade de Forecast" do Health Score
-- (src/features/commercial-intelligence/application/healthScore.ts) nunca tem um snapshot antigo
-- para comparar contra o realizado, e fica permanentemente "não disponível" em produção.
-- Append-only por design: nenhum UNIQUE por (organizationId, period) — cada corrida do snapshot
-- semanal insere uma linha nova, mesmo dentro do mesmo período, preservando o histórico de
-- revisões em vez de sobrescrever.
CREATE TABLE "ForecastSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rulesVersion" TEXT NOT NULL,
    "commitAmount" DECIMAL(14,2) NOT NULL,
    "bestCaseAmount" DECIMAL(14,2) NOT NULL,
    "forecastAmount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',

    CONSTRAINT "ForecastSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ForecastSnapshot_organizationId_period_idx" ON "ForecastSnapshot"("organizationId", "period");
CREATE INDEX "ForecastSnapshot_organizationId_period_snapshotAt_idx" ON "ForecastSnapshot"("organizationId", "period", "snapshotAt");

ALTER TABLE "ForecastSnapshot"
    ADD CONSTRAINT "ForecastSnapshot_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS — mesmo padrão direto de CommercialGoal/LeadStageHistory (organizationId próprio, sem
-- necessidade de entrar na allowlist de bypass de bootstrap: toda leitura/escrita acontece dentro
-- de uma requisição já autenticada, com app.current_tenant_id já setado).
ALTER TABLE "ForecastSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ForecastSnapshot" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "ForecastSnapshot" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
)
WITH CHECK (true);
