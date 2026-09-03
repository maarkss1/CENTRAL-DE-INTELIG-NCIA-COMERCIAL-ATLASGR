-- Habilita RLS em CopilotoBitrixFieldMapping (Onda 4), mesmo padrão das 6 tabelas do Copiloto IA
-- da fundação (migration 20260902130000_copiloto_ia_rls) — organizationId obrigatório próprio, é
-- o caso direto.

ALTER TABLE "CopilotoBitrixFieldMapping" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CopilotoBitrixFieldMapping" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy ON "CopilotoBitrixFieldMapping";
CREATE POLICY tenant_isolation_policy ON "CopilotoBitrixFieldMapping" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
)
WITH CHECK (true);
