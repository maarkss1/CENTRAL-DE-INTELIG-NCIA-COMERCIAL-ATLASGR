-- Notificações, Automações e atribuição de custo de IA por organização.

-- 1. AILog ganha tenant.
-- Nullable de propósito: os registros já gravados não têm como ser atribuídos retroativamente a
-- uma organização, e inventar um dono para eles falsearia o relatório de consumo.
ALTER TABLE "AILog" ADD COLUMN "organizationId" TEXT;

ALTER TABLE "AILog"
    ADD CONSTRAINT "AILog_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AILog_organizationId_createdAt_idx" ON "AILog"("organizationId", "createdAt");

-- 2. Enums
CREATE TYPE "NotificationKind" AS ENUM ('Info', 'Sucesso', 'Alerta', 'Erro');
CREATE TYPE "AutomationTrigger" AS ENUM ('Lead criado', 'Lead mudou de status', 'Atividade concluída');
CREATE TYPE "AutomationAction" AS ENUM ('Notificar equipe', 'Criar atividade');

-- 3. Automation
CREATE TABLE "Automation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "trigger" "AutomationTrigger" NOT NULL,
    "conditions" JSONB,
    "action" "AutomationAction" NOT NULL,
    "actionConfig" JSONB NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Automation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Automation_organizationId_enabled_idx" ON "Automation"("organizationId", "enabled");

ALTER TABLE "Automation"
    ADD CONSTRAINT "Automation_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Notification
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "kind" "NotificationKind" NOT NULL DEFAULT 'Info',
    "entity" TEXT,
    "entityId" TEXT,
    "readAt" TIMESTAMP(3),
    "userId" TEXT,
    "automationId" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- A listagem filtra por organização e por lida/não lida, sempre ordenando por data.
CREATE INDEX "Notification_organizationId_readAt_createdAt_idx"
    ON "Notification"("organizationId", "readAt", "createdAt");

ALTER TABLE "Notification"
    ADD CONSTRAINT "Notification_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL e não CASCADE: apagar a regra não deve apagar o histórico do que ela já notificou.
ALTER TABLE "Notification"
    ADD CONSTRAINT "Notification_automationId_fkey"
    FOREIGN KEY ("automationId") REFERENCES "Automation"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. RLS, no mesmo padrão das demais tabelas com tenant.
ALTER TABLE "Automation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Automation" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "Automation" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
);

ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "Notification" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
);

-- AILog tem organizationId nulo nos registros antigos; a política precisa deixá-los visíveis para
-- quem faz manutenção (bypass) sem expô-los a nenhum tenant específico.
ALTER TABLE "AILog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AILog" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "AILog" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
);
