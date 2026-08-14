-- Onda 2.5 - Agente 01 (Plataforma, Segurança e Dados)
--
-- Corrige a falha observada em `npm run verify:ai`: chamadas de IA executadas fora de uma
-- request HTTP (scripts, workers e verificadores) chegam a `logAiUsage()` sem tenant no
-- AsyncLocalStorage. Nesses casos o gateway grava `organizationId = NULL`.
--
-- Prisma usa INSERT ... RETURNING. Portanto a linha recém-inserida também precisa satisfazer
-- uma policy de SELECT no mesmo contexto; permitir NULL apenas no WITH CHECK de INSERT não basta.
--
-- Segurança: NULL não é bypass de tenant. Uma linha não atribuída só pode ser criada/retornada
-- quando NÃO existe tenant ativo na sessão e a conexão é interna do banco. Se houver
-- app.current_tenant_id, mesmo uma conexão interna não pode fabricar nem enxergar AILog NULL.
-- Roles expostas pelo PostgREST (anon/authenticated) nunca entram nesse corredor interno.

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
    OR (
        "organizationId" IS NULL
        AND COALESCE(current_setting('app.current_tenant_id', TRUE), '') = ''
        AND current_user NOT IN ('anon', 'authenticated')
    )
);

CREATE POLICY ailog_tenant_insert_policy ON "AILog"
FOR INSERT
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
    OR (
        "organizationId" IS NULL
        AND COALESCE(current_setting('app.current_tenant_id', TRUE), '') = ''
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
