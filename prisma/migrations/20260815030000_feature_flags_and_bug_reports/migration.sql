-- Governança de 12 requisitos de arquitetura — item 7 (Feature Flags) e item 8 (Módulo de
-- Reportar Problemas). Três tabelas novas: FeatureFlag (catálogo global), OrganizationFeatureFlag
-- (override por tenant) e BugReport (relatos capturados pelo botão flutuante do frontend).

-- ─── FeatureFlag ────────────────────────────────────────────────────────────────────────────
CREATE TABLE "FeatureFlag" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FeatureFlag_key_key" ON "FeatureFlag"("key");

-- Catálogo global, sem organizationId (nada de tenant para isolar) — mesmo caso de
-- AiEngineSetting em 20260807100000_enable_rls_remaining_tables: a policy só exige que a conexão
-- seja da própria app com contexto de tenant já setado (ou bypass), bloqueando acesso direto via
-- anon/authenticated do PostgREST do Supabase. Autorização admin-vs-usuário-comum para ESCRITA
-- é responsabilidade da rota (requireRole(['ADMIN']) em featureFlags.routes.ts).
ALTER TABLE "FeatureFlag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeatureFlag" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_context_policy ON "FeatureFlag";
CREATE POLICY app_context_policy ON "FeatureFlag" FOR ALL
USING (
    (
        current_setting('app.current_tenant_id', TRUE) IS NOT NULL
        AND current_setting('app.current_tenant_id', TRUE) <> ''
    )
    OR current_setting('app.bypass_rls', TRUE) = 'on'
)
WITH CHECK (true);

-- ─── OrganizationFeatureFlag ────────────────────────────────────────────────────────────────
CREATE TABLE "OrganizationFeatureFlag" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "featureFlagId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updatedByUserId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationFeatureFlag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationFeatureFlag_organizationId_featureFlagId_key" ON "OrganizationFeatureFlag"("organizationId", "featureFlagId");
CREATE INDEX "OrganizationFeatureFlag_organizationId_idx" ON "OrganizationFeatureFlag"("organizationId");

ALTER TABLE "OrganizationFeatureFlag"
    ADD CONSTRAINT "OrganizationFeatureFlag_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrganizationFeatureFlag"
    ADD CONSTRAINT "OrganizationFeatureFlag_featureFlagId_fkey"
    FOREIGN KEY ("featureFlagId") REFERENCES "FeatureFlag"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Isolamento de tenant via RLS — mesmo padrão de ThreeCXConnection/BitrixConnection: FORCE
-- também restringe o dono da tabela, e a policy libera acesso quando app.current_tenant_id
-- (setado pelo middleware do Prisma em src/lib/prisma.ts) bate com a organização da linha, ou
-- quando app.bypass_rls = 'on'.
ALTER TABLE "OrganizationFeatureFlag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrganizationFeatureFlag" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy ON "OrganizationFeatureFlag";
CREATE POLICY tenant_isolation_policy ON "OrganizationFeatureFlag" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
)
WITH CHECK (true);

-- ─── BugReport ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE "BugReport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "userEmail" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "context" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BugReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BugReport_organizationId_status_idx" ON "BugReport"("organizationId", "status");
CREATE INDEX "BugReport_organizationId_createdAt_idx" ON "BugReport"("organizationId", "createdAt");

ALTER TABLE "BugReport"
    ADD CONSTRAINT "BugReport_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BugReport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BugReport" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy ON "BugReport";
CREATE POLICY tenant_isolation_policy ON "BugReport" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
)
WITH CHECK (true);
