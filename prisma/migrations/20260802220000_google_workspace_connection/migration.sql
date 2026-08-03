-- Conexão real de Google Workspace (Gmail + Calendar) por organização — antes disso,
-- google.service.ts era inteiramente simulado (access_token: 'mock_token'), sem persistir nada e
-- sem nenhum lugar real para guardar o token.

CREATE TABLE "GoogleWorkspaceConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleWorkspaceConnection_pkey" PRIMARY KEY ("id")
);

-- Uma conexão por organização (é a integração do tenant, não de um usuário individual).
CREATE UNIQUE INDEX "GoogleWorkspaceConnection_organizationId_key" ON "GoogleWorkspaceConnection"("organizationId");

ALTER TABLE "GoogleWorkspaceConnection"
    ADD CONSTRAINT "GoogleWorkspaceConnection_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GoogleWorkspaceConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GoogleWorkspaceConnection" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "GoogleWorkspaceConnection" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
);
