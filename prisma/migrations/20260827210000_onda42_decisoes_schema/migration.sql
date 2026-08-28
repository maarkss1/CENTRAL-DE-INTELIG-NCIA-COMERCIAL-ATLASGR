-- Onda 42 (dossiê de decisões da auditoria CPI, respondido pelo usuário) — consolida as migrations
-- pendentes de 4 decisões (DEC-01, DEC-04, DEC-09, DEC-13, DEC-14) cujo código de aplicação já foi
-- implementado nesta mesma onda, cada uma com um handoff próprio em .agents/handoffs/onda-42/:
--   01-para-00-pii-hash-fields.md            (DEC-01 — Contact.*Hash)
--   02-para-00-registrar-worker-purge-bitrix.md (DEC-04 — BitrixExtractionRun.purgedAt)
--   03-para-00-campo-orcamento-organization.md  (DEC-09 — Organization.monthly*BudgetUsd)
--   06-para-00-model-search-execution.md        (DEC-13 — ProspectingSearchExecution)
--   07-para-00-automation-versioning.md         (DEC-14 — AutomationVersion)
-- DEC-16 (@@unique([organizationId, cnpj]) em Company) foi deliberadamente deixado de fora — ver
-- 08-para-00-unique-cnpj-company.md: exige backfill de normalização + query de detecção de
-- duplicata real contra dado de produção antes de poder ser aplicado com segurança, e não há
-- Postgres de produção acessível nesta sessão para rodar essa verificação.

-- ── DEC-01: índice determinístico (HMAC-SHA256) para busca/dedup exata de PII de Contact ──
-- Metadata-only, sem lock longo mesmo com a tabela grande (Postgres >= 11).
ALTER TABLE "Contact" ADD COLUMN "phoneHash" TEXT;
ALTER TABLE "Contact" ADD COLUMN "whatsappHash" TEXT;
ALTER TABLE "Contact" ADD COLUMN "emailHash" TEXT;

CREATE INDEX "Contact_phoneHash_idx" ON "Contact"("phoneHash");
CREATE INDEX "Contact_whatsappHash_idx" ON "Contact"("whatsappHash");
CREATE INDEX "Contact_emailHash_idx" ON "Contact"("emailHash");

-- ── DEC-04: marcador de expurgo LGPD do histórico de extrações Bitrix ──
ALTER TABLE "BitrixExtractionRun" ADD COLUMN "purgedAt" TIMESTAMP(3);
CREATE INDEX "BitrixExtractionRun_organizationId_purgedAt_idx" ON "BitrixExtractionRun"("organizationId", "purgedAt");

-- ── DEC-09: teto mensal de orçamento por organização (IA e prospecção) ──
ALTER TABLE "Organization" ADD COLUMN "monthlyAiBudgetUsd" DOUBLE PRECISION;
ALTER TABLE "Organization" ADD COLUMN "monthlyProspectingBudgetUsd" DOUBLE PRECISION;

-- ── DEC-13: Search-ID formal rastreável (execução de busca de prospecção) ──
CREATE TABLE "ProspectingSearchExecution" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "savedSearchId" TEXT,
    "criteria" JSONB NOT NULL,
    "providerMode" TEXT NOT NULL,
    "providersCalled" JSONB NOT NULL,
    "totalResults" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProspectingSearchExecution_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProspectingSearchExecution_organizationId_startedAt_idx" ON "ProspectingSearchExecution"("organizationId", "startedAt");
CREATE INDEX "ProspectingSearchExecution_savedSearchId_idx" ON "ProspectingSearchExecution"("savedSearchId");

ALTER TABLE "ProspectingSearchExecution" ADD CONSTRAINT "ProspectingSearchExecution_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProspectingSearchExecution" ADD CONSTRAINT "ProspectingSearchExecution_savedSearchId_fkey" FOREIGN KEY ("savedSearchId") REFERENCES "SavedSearch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS: mesmo padrão tenant_isolation_policy de toda tabela nova deste schema. WITH CHECK(true) —
-- a defesa real contra INSERT cross-tenant é a aplicação sempre gravar organizationId a partir do
-- tenant autenticado (SearchExecutionTracker.finish() só recebe organizationId de req.user, nunca
-- do corpo da request), não a policy em si.
ALTER TABLE "ProspectingSearchExecution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProspectingSearchExecution" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON "ProspectingSearchExecution" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
)
WITH CHECK (true);

-- ── DEC-14: histórico de versões da regra de uma Automation ──
CREATE TABLE "AutomationVersion" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "trigger" "AutomationTrigger" NOT NULL,
    "conditions" JSONB,
    "action" "AutomationAction" NOT NULL,
    "actionConfig" JSONB NOT NULL,
    "editedByUserId" TEXT,
    "editedByEmail" TEXT,
    "changeReason" TEXT NOT NULL DEFAULT 'update',
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationVersion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AutomationVersion_automationId_createdAt_idx" ON "AutomationVersion"("automationId", "createdAt");
CREATE INDEX "AutomationVersion_organizationId_idx" ON "AutomationVersion"("organizationId");

ALTER TABLE "AutomationVersion" ADD CONSTRAINT "AutomationVersion_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationVersion" ADD CONSTRAINT "AutomationVersion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutomationVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationVersion" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON "AutomationVersion" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
)
WITH CHECK (true);
