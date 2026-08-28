-- SavedSearch e ThreeCXCallEvent foram criadas sem RLS habilitada (descuido) — ambas têm
-- organizationId e FK para Organization, mesmo padrão de todo o resto do schema multi-tenant.
-- Confirmado por varredura real do banco (tabelas com coluna "organizationId" e
-- relrowsecurity = false), não suposição. Corrige aqui em vez de editar as migrações já
-- aplicadas, mesmo padrão de 20260810000100_bitrix_sync_log_rls.

ALTER TABLE "SavedSearch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SavedSearch" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "SavedSearch" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
);

ALTER TABLE "ThreeCXCallEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ThreeCXCallEvent" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "ThreeCXCallEvent" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
);
