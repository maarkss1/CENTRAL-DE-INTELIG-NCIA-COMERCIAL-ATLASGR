-- Conexão do Bitrix24 por organização — webhook de entrada gerado pelo próprio usuário no
-- portal Bitrix24 dele. Antes disso a URL do webhook não era persistida em lugar nenhum: cada
-- exportação exigia colar a URL de novo no corpo da requisição, e não havia nenhuma tela para
-- configurá-la. Mesmo padrão de GoogleWorkspaceConnection (uma conexão por organização, RLS por
-- tenant, sem criptografia de campo própria).

CREATE TABLE "BitrixConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "webhookUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BitrixConnection_pkey" PRIMARY KEY ("id")
);

-- Uma conexão por organização (é a integração do tenant, não de um usuário individual).
CREATE UNIQUE INDEX "BitrixConnection_organizationId_key" ON "BitrixConnection"("organizationId");

ALTER TABLE "BitrixConnection"
    ADD CONSTRAINT "BitrixConnection_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BitrixConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BitrixConnection" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "BitrixConnection" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
);
