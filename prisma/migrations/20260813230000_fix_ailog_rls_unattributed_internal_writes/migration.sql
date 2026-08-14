-- Onda 2.5 - Agente 01 (Plataforma, Segurança e Dados)
--
-- Corrige a falha observada em `npm run verify:ai`: chamadas de IA executadas fora de uma
-- request HTTP (scripts, workers e verificadores) chegam a `logAiUsage()` sem tenant no
-- AsyncLocalStorage. Nesses casos o gateway grava `organizationId = NULL`, mas a policy antiga
-- era `FOR ALL` sem `WITH CHECK` explícito; no PostgreSQL o predicado de USING também acabava
-- validando INSERT e rejeitava a linha.
--
-- Segurança: não usamos `WITH CHECK (true)` para AILog. Isso permitiria que roles expostas pelo
-- PostgREST fabricassem logs atribuídos a qualquer organização. Em vez disso separamos as
-- operações e permitimos uma linha não atribuída SOMENTE para uma conexão interna do banco, nunca
-- para as roles `anon` / `authenticated` usadas pelo PostgREST do Supabase.
--
-- Leitura, update e delete continuam isolados por tenant (ou bypass explícito da aplicação).

DROP POLICY IF EXISTS tenant_isolation_policy ON "AILog";
DROP POLICY IF EXISTS ailog_tenant_select_policy ON "AILog";
DROP POLICY IF EXISTS ailog_tenant_insert_policy ON "AILog";
DROP POLICY IF EXISTS ailog_tenant_update_policy ON "AILog";
DROP POLICY IF EXISTS ailog_tenant_delete_policy ON "AILog";

CREATE POLICY ailog_tenant_select_policy ON "AILog"
FOR SELECT
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
);

CREATE POLICY ailog_tenant_insert_policy ON "AILog"
FOR INSERT
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
    OR (
        "organizationId" IS NULL
        AND current_user NOT IN ('anon', 'authenticated')
    )
);

CREATE POLICY ailog_tenant_update_policy ON "AILog"
FOR UPDATE
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
);

CREATE POLICY ailog_tenant_delete_policy ON "AILog"
FOR DELETE
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
);
