-- Market Intelligence v1.4 — cenários econômicos imutáveis e auditáveis.
-- A decisão de contratação deixa de existir apenas no estado do React e passa a ter snapshot
-- reproduzível por tenant, com premissas, política, calibração CRM, território canônico e resultado.
--
-- A tabela é deliberadamente append-only no nível da API. Não existem endpoints de UPDATE/DELETE.
-- O hash idempotente impede duplicação do mesmo estado econômico dentro da organização.
-- `createdBy` preserva o identificador histórico do ator, mas não cria FK para o storage de auth:
-- a trilha precisa sobreviver à remoção/rotação de usuários e não deve depender do nome físico da
-- tabela gerenciada pelo provedor de autenticação.

CREATE TABLE "MarketIntelligenceEconomicScenario" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdBy" TEXT,
    "label" TEXT NOT NULL,
    "territoryId" TEXT NOT NULL,
    "baseCity" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "radiusKm" INTEGER NOT NULL,
    "commercialScenario" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "auditVersion" TEXT NOT NULL,
    "methodologyVersion" TEXT NOT NULL,
    "economicModelVersion" TEXT NOT NULL,
    "calibrationVersion" TEXT,
    "calibrationApplied" BOOLEAN NOT NULL DEFAULT false,
    "calibrationQuality" TEXT,
    "tamAccounts" INTEGER,
    "samAccounts" INTEGER,
    "monthlyFixedCost" DOUBLE PRECISION NOT NULL,
    "paybackMonth" INTEGER,
    "roi12Pct" DOUBLE PRECISION,
    "roi24Pct" DOUBLE PRECISION,
    "snapshotHash" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketIntelligenceEconomicScenario_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MarketIntelligenceEconomicScenario_radius_check" CHECK ("radiusKm" IN (100, 150, 200, 250, 300, 400)),
    CONSTRAINT "MarketIntelligenceEconomicScenario_scenario_check" CHECK ("commercialScenario" IN ('CONSERVADOR', 'BASE', 'AGRESSIVO')),
    CONSTRAINT "MarketIntelligenceEconomicScenario_recommendation_check" CHECK ("recommendation" IN ('PREMISSAS_PENDENTES', 'POLITICA_PENDENTE', 'RECOMENDADO', 'NAO_RECOMENDADO')),
    CONSTRAINT "MarketIntelligenceEconomicScenario_label_check" CHECK (char_length("label") BETWEEN 1 AND 120)
);

CREATE UNIQUE INDEX "MarketIntelligenceEconomicScenario_org_hash_key"
    ON "MarketIntelligenceEconomicScenario"("organizationId", "snapshotHash");
CREATE INDEX "MarketIntelligenceEconomicScenario_org_created_idx"
    ON "MarketIntelligenceEconomicScenario"("organizationId", "createdAt" DESC);
CREATE INDEX "MarketIntelligenceEconomicScenario_org_territory_idx"
    ON "MarketIntelligenceEconomicScenario"("organizationId", "territoryId", "createdAt" DESC);

ALTER TABLE "MarketIntelligenceEconomicScenario"
    ADD CONSTRAINT "MarketIntelligenceEconomicScenario_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Row Level Security: mesma política fail-closed usada pelas tabelas tenant-scoped do repositório.
ALTER TABLE "MarketIntelligenceEconomicScenario" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MarketIntelligenceEconomicScenario" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "MarketIntelligenceEconomicScenario" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
);
