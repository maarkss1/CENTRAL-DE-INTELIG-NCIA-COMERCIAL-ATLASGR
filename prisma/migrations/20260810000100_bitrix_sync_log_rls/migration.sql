-- BitrixSyncLog foi criada na migração anterior sem RLS habilitada (descuido) — corrige aqui em
-- vez de editar a migração já aplicada, seguindo o mesmo padrão de isolamento por tenant usado em
-- BitrixConnection/BitrixSyncRule (ver 20260803120000_bitrix_connection e
-- 20260804200000_bitrix_sync_rule).

ALTER TABLE "BitrixSyncLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BitrixSyncLog" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "BitrixSyncLog" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
);
