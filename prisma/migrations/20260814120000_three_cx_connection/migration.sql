-- Conexão de PABX 3CX por organização — antes desta tabela, threecx.service.ts guardava tudo
-- (URL do PABX, ramal, apiKey/apiSecret) num `Map` em memória (`memory3CXStore`), perdido a cada
-- restart/redeploy do processo e inconsistente entre instâncias com mais de um processo do
-- servidor rodando ao mesmo tempo. Mesmo padrão de BitrixConnection: uma organização pode ter
-- mais de um PABX 3CX (ex.: AtlasGR e TotalTrac com telefonia separada), por isso não é @unique
-- por organizationId. Ver handoff .agents/handoffs/onda-1/06-para-01-persistencia-3cx.md.
--
-- apiKey/apiSecret são cifrados em repouso (AES-256-GCM) de forma transparente pela extensão
-- Prisma em src/lib/prisma.ts (ver ENCRYPTED_FIELDS) — mesmo tratamento de
-- BitrixConnection.webhookUrl/webhookSecret e GoogleWorkspaceConnection.accessToken/refreshToken.

CREATE TABLE "ThreeCXConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '3CX',
    "pbxUrl" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "apiKey" TEXT,
    "apiSecret" TEXT,
    "autoDialEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThreeCXConnection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ThreeCXConnection_organizationId_idx" ON "ThreeCXConnection"("organizationId");

ALTER TABLE "ThreeCXConnection"
    ADD CONSTRAINT "ThreeCXConnection_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Isolamento de tenant via RLS — mesmo padrão de BitrixConnection (20260803120000_bitrix_connection)
-- e GoogleWorkspaceConnection: FORCE também restringe o dono da tabela, e a policy libera acesso
-- quando app.current_tenant_id (setado pelo middleware do Prisma em src/lib/prisma.ts) bate com a
-- organização da linha, ou quando app.bypass_rls = 'on' (rotas de bootstrap sem tenant conhecido).
ALTER TABLE "ThreeCXConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ThreeCXConnection" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "ThreeCXConnection" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
);
