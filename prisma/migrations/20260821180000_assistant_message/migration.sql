-- Fase 2 (respostas de IA): o histórico do Chatbook vivia só em useState no frontend e sumia ao
-- recarregar a tela; sem persistência, cada pergunta também era respondida sem nenhuma memória do
-- que já tinha sido dito na mesma conversa. Cria a tabela com RLS habilitada já nesta migração
-- (mesmo padrão de 20260810120000_report_persistence), não numa correção posterior.

-- CreateTable
CREATE TABLE "AssistantMessage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantMessage_organizationId_userId_brand_createdAt_idx" ON "AssistantMessage"("organizationId", "userId", "brand", "createdAt");

-- AddForeignKey
ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RowLevelSecurity
ALTER TABLE "AssistantMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssistantMessage" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "AssistantMessage" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
);
