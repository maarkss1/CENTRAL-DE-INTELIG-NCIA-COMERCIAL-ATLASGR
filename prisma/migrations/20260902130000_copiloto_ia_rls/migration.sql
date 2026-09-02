-- Habilita RLS nas 6 tabelas do Copiloto Comercial IA (Onda 1 — fundação), seguindo exatamente o
-- mesmo padrão de `ConversationSignal` (migration 20260807100000_enable_rls_remaining_tables,
-- item 11): todas têm `organizationId` obrigatório próprio, então a policy é o caso direto —
-- libera quando `app.current_tenant_id` (setado pelo middleware do Prisma em src/lib/prisma.ts)
-- bate com a linha, ou quando `app.bypass_rls = 'on'` (workers/descoberta cross-tenant).
-- `WITH CHECK (true)` pelo mesmo motivo documentado nas migrations de RLS anteriores: a extensão
-- do Prisma só intercepta chamadas de model, não cobre todo `$queryRaw` eventual.

ALTER TABLE "CopilotoConversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CopilotoConversation" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy ON "CopilotoConversation";
CREATE POLICY tenant_isolation_policy ON "CopilotoConversation" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
)
WITH CHECK (true);

ALTER TABLE "CopilotoTranscriptSegment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CopilotoTranscriptSegment" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy ON "CopilotoTranscriptSegment";
CREATE POLICY tenant_isolation_policy ON "CopilotoTranscriptSegment" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
)
WITH CHECK (true);

ALTER TABLE "CopilotoInsight" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CopilotoInsight" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy ON "CopilotoInsight";
CREATE POLICY tenant_isolation_policy ON "CopilotoInsight" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
)
WITH CHECK (true);

ALTER TABLE "CopilotoCrmFieldSuggestion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CopilotoCrmFieldSuggestion" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy ON "CopilotoCrmFieldSuggestion";
CREATE POLICY tenant_isolation_policy ON "CopilotoCrmFieldSuggestion" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
)
WITH CHECK (true);

ALTER TABLE "CopilotoDealHealthSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CopilotoDealHealthSnapshot" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy ON "CopilotoDealHealthSnapshot";
CREATE POLICY tenant_isolation_policy ON "CopilotoDealHealthSnapshot" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
)
WITH CHECK (true);

ALTER TABLE "CopilotoConsentRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CopilotoConsentRecord" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy ON "CopilotoConsentRecord";
CREATE POLICY tenant_isolation_policy ON "CopilotoConsentRecord" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
)
WITH CHECK (true);
