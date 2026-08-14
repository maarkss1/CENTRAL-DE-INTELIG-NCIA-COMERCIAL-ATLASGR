-- Onda 2.5 - Agente 01 (Plataforma, Segurança e Dados)
--
-- Chamadas de IA internas (scripts, workers e verificadores) podem não possuir tenant no
-- AsyncLocalStorage e precisam registrar AILog com organizationId = NULL.
--
-- Esse corredor NÃO usa app.bypass_rls e NÃO depende de estado temporário de sessão. O gravador
-- interno executa INSERT parametrizado SEM RETURNING. A policy aceita NULL somente quando:
--   1) a conexão é exatamente o papel backend NOSUPERUSER `prospector_app`; e
--   2) não existe app.current_tenant_id ativo.
--
-- Requisições tenant-scoped continuam bloqueadas para NULL, e SELECT de logs NULL permanece
-- fechado. O `prisma.aILog.create({ organizationId: null })` comum também continua falhando porque
-- o Prisma usa RETURNING, e a policy de SELECT não concede leitura da linha sem organização.

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
        AND current_user = 'prospector_app'
        AND COALESCE(current_setting('app.current_tenant_id', TRUE), '') = ''
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
