-- Módulo "Comercial Inteligente" (Revenue Command Center executivo, restrito a
-- ADMIN/GESTOR — ver src/lib/auth/authorization.ts). Duas tabelas novas, a extensão mínima de
-- schema necessária que não existia antes (ver comentário completo em prisma/schema.prisma,
-- acima dos models CommercialGoal/LeadStageHistory).

-- 1. CommercialGoal — meta comercial mensal (New MRR hoje), sempre digitada por um
-- Gestor/Admin (nunca inferida) para permitir "% da Meta"/Gap Forecast/Coverage sem fabricar
-- número quando nenhuma meta foi cadastrada ainda.
CREATE TABLE "CommercialGoal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "metric" TEXT NOT NULL DEFAULT 'NEW_MRR',
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialGoal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommercialGoal_organizationId_period_metric_key" ON "CommercialGoal"("organizationId", "period", "metric");
CREATE INDEX "CommercialGoal_organizationId_period_idx" ON "CommercialGoal"("organizationId", "period");

ALTER TABLE "CommercialGoal"
    ADD CONSTRAINT "CommercialGoal_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. LeadStageHistory — histórico estruturado de mudança de etapa (TimelineEvent é texto livre
-- e não suporta consulta de aging/duração). Alimentada dali em diante pelos pontos de escrita
-- que já movem uma oportunidade de etapa (ver src/features/commercial-intelligence/infra/
-- stageHistory.ts, chamado por crm360.service.ts). Histórico anterior a esta migration não
-- existe e não é fabricado — os endpoints tratam isso como dado ausente.
CREATE TABLE "LeadStageHistory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "pipelineId" TEXT,
    "stageId" TEXT,
    "stageName" TEXT NOT NULL,
    "probability" INTEGER,
    "isWon" BOOLEAN NOT NULL DEFAULT false,
    "isLost" BOOLEAN NOT NULL DEFAULT false,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exitedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadStageHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LeadStageHistory_organizationId_leadId_enteredAt_idx" ON "LeadStageHistory"("organizationId", "leadId", "enteredAt");
CREATE INDEX "LeadStageHistory_organizationId_stageId_idx" ON "LeadStageHistory"("organizationId", "stageId");
CREATE INDEX "LeadStageHistory_leadId_exitedAt_idx" ON "LeadStageHistory"("leadId", "exitedAt");

ALTER TABLE "LeadStageHistory"
    ADD CONSTRAINT "LeadStageHistory_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeadStageHistory"
    ADD CONSTRAINT "LeadStageHistory_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. RLS — mesmo padrão das migrations 20260722020322_enable_rls / 20260807100000 (ver esses
-- arquivos para o racional completo). Ambas as tabelas têm organizationId próprio, então usam o
-- padrão direto (mesmo formato de ConversationSignal).
ALTER TABLE "CommercialGoal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CommercialGoal" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "CommercialGoal" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
)
WITH CHECK (true);

ALTER TABLE "LeadStageHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeadStageHistory" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "LeadStageHistory" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
)
WITH CHECK (true);
