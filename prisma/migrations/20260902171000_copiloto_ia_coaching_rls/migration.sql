-- Habilita RLS em CopilotoCoachingEvaluation (Onda 6), mesmo padrão das demais tabelas do
-- Copiloto IA — organizationId obrigatório próprio, é o caso direto.

ALTER TABLE "CopilotoCoachingEvaluation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CopilotoCoachingEvaluation" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy ON "CopilotoCoachingEvaluation";
CREATE POLICY tenant_isolation_policy ON "CopilotoCoachingEvaluation" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
)
WITH CHECK (true);
