-- DB-001 / DB-002 (auditoria de dívida técnica, Fase 0, ciclo C0.2)
--
-- Adiciona organizationId + RLS a KnowledgeChunk, Prompt e AgentMemory (DB-001 — AILog já tinha
-- ganhado organizationId + RLS na migration 20260731200000, não repetido aqui), e RLS a Prospect e
-- AIPendingAction, que já tinham a coluna mas nunca ganharam a política (DB-002).
--
-- Padrão de política adotado (diferente do usado em Document/DocumentChunk):
--   USING (leitura restrita ao tenant do contexto) + WITH CHECK (true) (escrita sempre permitida).
-- Motivo: `search.service.ts` já documenta que a extensão do Prisma que seta
-- `app.current_tenant_id` só intercepta operações de model, não `$queryRaw`/`$executeRaw`. Esta
-- migration protege tabelas escritas via SQL cru (KnowledgeChunk, via vector.service.ts) e via
-- create() disparado de dentro de um worker do BullMQ sem contexto de requisição (AIPendingAction,
-- via sdr-agent.ts + agent.worker.ts) — em ambos os casos `current_setting('app.current_tenant_id')`
-- pode estar vazio no momento da escrita. Com USING restritivo + WITH CHECK permissivo, a leitura
-- (onde está o vazamento cross-tenant que a auditoria pede pra fechar) fica protegida sem arriscar
-- rejeitar essas gravações legítimas.

-- 1. KnowledgeChunk
ALTER TABLE "KnowledgeChunk" ADD COLUMN "organizationId" TEXT;
CREATE INDEX "KnowledgeChunk_organizationId_idx" ON "KnowledgeChunk"("organizationId");
ALTER TABLE "KnowledgeChunk"
    ADD CONSTRAINT "KnowledgeChunk_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: hoje o tenant vive dentro de metadata (JSON), setado pelo próprio vector.service.ts.
-- Adota o valor quando aponta para uma Organization real; senão a linha fica órfã (organizationId
-- NULL), o que a torna invisível sob a política de leitura abaixo — comportamento seguro por
-- padrão, sem apagar nada.
UPDATE "KnowledgeChunk" k
SET "organizationId" = k.metadata->>'organizationId'
WHERE k.metadata->>'organizationId' IS NOT NULL
  AND EXISTS (SELECT 1 FROM "Organization" o WHERE o.id = k.metadata->>'organizationId');

ALTER TABLE "KnowledgeChunk" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KnowledgeChunk" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "KnowledgeChunk" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
)
WITH CHECK (true);

-- 2. Prompt
ALTER TABLE "Prompt" ADD COLUMN "organizationId" TEXT;
CREATE INDEX "Prompt_organizationId_category_idx" ON "Prompt"("organizationId", "category");
ALTER TABLE "Prompt"
    ADD CONSTRAINT "Prompt_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: `owner` já guarda o valor que prompt.routes.ts tentava usar como tenant (ver bug
-- corrigido junto desta migration: a rota lia `req.tenantId`, que não existe — sempre caía no
-- literal 'system'). Ainda assim, adota `owner` quando por acaso apontar pra uma Organization real.
UPDATE "Prompt" p
SET "organizationId" = p.owner
WHERE EXISTS (SELECT 1 FROM "Organization" o WHERE o.id = p.owner);

ALTER TABLE "Prompt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Prompt" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "Prompt" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
)
WITH CHECK (true);

-- 3. AgentMemory
ALTER TABLE "AgentMemory" ADD COLUMN "organizationId" TEXT;
CREATE INDEX "AgentMemory_organizationId_idx" ON "AgentMemory"("organizationId");
ALTER TABLE "AgentMemory"
    ADD CONSTRAINT "AgentMemory_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Sem backfill possível: linhas existentes só têm sessionId/agentType, sem nenhum dado de tenant
-- recuperável. Ficam com organizationId NULL — órfãs, invisíveis sob a política abaixo.

ALTER TABLE "AgentMemory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentMemory" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "AgentMemory" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
)
WITH CHECK (true);

-- Nota: AILog NÃO está nesta migration — a migration 20260731200000 já habilitou RLS nela
-- (ENABLE + FORCE + tenant_isolation_policy). Repetir aqui colidiria ("policy already exists").
-- Achado à parte, fora do escopo de DB-001/DB-002 (registrado em 08-PLANO-DE-SEGURANCA.md e
-- reportado ao usuário, não corrigido nesta sessão): aquela política não tem `OR organizationId
-- IS NULL`, então os registros "não atribuídos" que usage.service.ts soma para qualquer tenant
-- (contador de "chamadas não atribuídas" na tela de Consumo) ficam invisíveis sob RLS real —
-- só um `bypass_rls` os vê. Corrigir exigiria uma migration nova alterando essa política.

-- 4. Prospect (DB-002 — coluna já existe, só falta a política)
ALTER TABLE "Prospect" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Prospect" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "Prospect" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
)
WITH CHECK (true);

-- 5. AIPendingAction (DB-002 — coluna já existe, só falta a política)
ALTER TABLE "AIPendingAction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AIPendingAction" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "AIPendingAction" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
)
WITH CHECK (true);
