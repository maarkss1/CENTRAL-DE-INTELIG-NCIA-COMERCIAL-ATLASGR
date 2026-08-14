-- Habilita RLS nas 11 tabelas que o advisor de segurança do Supabase reportou como expostas
-- (RLS desabilitado = legível/gravável por completo pelas roles `anon`/`authenticated` do
-- PostgREST, independente de qualquer checagem feita pelo backend Node/Prisma).
--
-- Segue o MESMO padrão já estabelecido nas migrations 20260722020322_enable_rls e
-- 20260801120000_tenant_scope_ai_memory_prompts_and_rls: ENABLE + FORCE ROW LEVEL SECURITY,
-- e uma policy que libera acesso quando `app.current_tenant_id` (setado pelo middleware do
-- Prisma em src/lib/prisma.ts) bate com o tenant da linha, OU quando `app.bypass_rls = 'on'`
-- (setado só pelas rotas do Better Auth antes de haver tenant conhecido — ver
-- BYPASS_RLS_ALLOWED_MODELS em prisma.ts). `WITH CHECK (true)` é usado nas tabelas que podem
-- ser escritas fora do ciclo normal de request (worker/BullMQ/webhook), pelo mesmo motivo
-- documentado na migration de 08/01: a extensão do Prisma só intercepta chamadas de model,
-- não `$queryRaw`, e algumas escritas legitimamente acontecem sem `app.current_tenant_id` setado.
--
-- Esta migration pode ter sido parcialmente aplicada antes de ser registrada como falha. Por isso,
-- cada policy é substituída de forma idempotente com DROP POLICY IF EXISTS + CREATE POLICY.
-- Isso não remove dados; apenas garante que uma reexecução produza exatamente a policy versionada.
--
-- IMPORTANTE antes de aplicar em produção: testar o fluxo de login/signup/reset de senha
-- (Better Auth) após esta migration — é a parte mais delicada (tabelas session/account/verification).

-- 1. _prisma_migrations — tabela interna do Prisma, sem dado de tenant/usuário (só nome/checksum
-- de migration). NÃO usa FORCE nem policy: `prisma migrate deploy` acessa esta tabela fora do
-- middleware da app (conexão própria do CLI), então FORCE arriscaria quebrar deploys. Só ENABLE
-- já basta para bloquear as roles anon/authenticated do Supabase, que não são a role dona da
-- tabela.
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;

-- 2. EnrichmentLog — sem organizationId próprio; é filho de Company (companyId). Mesmo padrão
-- usado para Note/TimelineEvent na migration original (filtro via tabela pai).
ALTER TABLE "EnrichmentLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EnrichmentLog" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy ON "EnrichmentLog";
CREATE POLICY tenant_isolation_policy ON "EnrichmentLog" FOR ALL
USING (
    "companyId" IN (
        SELECT id FROM "Company"
        WHERE "organizationId" = current_setting('app.current_tenant_id', TRUE)
    )
    OR current_setting('app.bypass_rls', TRUE) = 'on'
)
WITH CHECK (true);

-- 3. AuditLog — tem coluna própria `tenantId` (não `organizationId`). Escrito por
-- AuditService.log() de dentro do próprio middleware do Prisma (src/lib/prisma.ts), então na
-- prática sempre carrega o tenant da request que disparou o CREATE/UPDATE/DELETE auditado.
-- Linhas com tenantId NULL (ações de sistema sem tenant) ficam invisíveis fora de bypass —
-- mesmo comportamento "seguro por padrão" já adotado para linhas órfãs em KnowledgeChunk/Prompt.
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy ON "AuditLog";
CREATE POLICY tenant_isolation_policy ON "AuditLog" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "tenantId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
)
WITH CHECK (true);

-- 4. session (Better Auth) — sem organizationId próprio; liga a "user" via userId. "Session" já
-- está em BYPASS_RLS_ALLOWED_MODELS (prisma.ts), então o bypass do fluxo de login já cobre o
-- caso "ainda não sei o tenant". Fora do bypass, isola por organização via join em "user".
ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "session" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy ON "session";
CREATE POLICY tenant_isolation_policy ON "session" FOR ALL
USING (
    "userId" IN (
        SELECT id FROM "user"
        WHERE "organizationId" = current_setting('app.current_tenant_id', TRUE)
    )
    OR current_setting('app.bypass_rls', TRUE) = 'on'
)
WITH CHECK (true);

-- 5. account (Better Auth) — mesmo padrão de session. Guarda credenciais (password hash do
-- provider "credential", tokens OAuth) — é a tabela mais sensível deste grupo.
ALTER TABLE "account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "account" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy ON "account";
CREATE POLICY tenant_isolation_policy ON "account" FOR ALL
USING (
    "userId" IN (
        SELECT id FROM "user"
        WHERE "organizationId" = current_setting('app.current_tenant_id', TRUE)
    )
    OR current_setting('app.bypass_rls', TRUE) = 'on'
)
WITH CHECK (true);

-- 6. verification (Better Auth) — tokens de verificação de e-mail / reset de senha / magic link.
-- Não tem NENHUMA coluna que amarre a user/organization (por design: é consultada ANTES de
-- existir sessão ou tenant conhecido). Não dá para isolar por tenant. A única política possível
-- é "somente quando o backend setar app.bypass_rls='on' explicitamente" (já é o que
-- BYPASS_RLS_ALLOWED_MODELS faz para o model Verification) — isso já fecha o buraco real (acesso
-- direto via anon/authenticated do PostgREST do Supabase) sem tocar no fluxo de auth existente.
ALTER TABLE "verification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "verification" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bypass_only_policy ON "verification";
CREATE POLICY bypass_only_policy ON "verification" FOR ALL
USING (current_setting('app.bypass_rls', TRUE) = 'on')
WITH CHECK (current_setting('app.bypass_rls', TRUE) = 'on');

-- 7. AIGovernancePolicy — tem tenantId próprio (obrigatório). Tabela stub, sem nenhum caller no
-- código hoje — policy já pronta para quando for conectada.
ALTER TABLE "AIGovernancePolicy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AIGovernancePolicy" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy ON "AIGovernancePolicy";
CREATE POLICY tenant_isolation_policy ON "AIGovernancePolicy" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "tenantId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
)
WITH CHECK (true);

-- 8. AIEvaluation — sem organizationId, sem relação real com AILog (logId é só uma String solta,
-- não uma FK). Zero chamadas no código (confirmado por busca no repositório inteiro) — tabela
-- morta. Sem coluna de tenant não dá pra isolar por organização; fica bloqueada por padrão
-- (só acessível via bypass explícito) até ganhar uma coluna organizationId de verdade.
ALTER TABLE "AIEvaluation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AIEvaluation" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bypass_only_policy ON "AIEvaluation";
CREATE POLICY bypass_only_policy ON "AIEvaluation" FOR ALL
USING (current_setting('app.bypass_rls', TRUE) = 'on')
WITH CHECK (current_setting('app.bypass_rls', TRUE) = 'on');

-- 9. KnowledgeDocument — armazenamento legado de RAG, substituído por Document/DocumentChunk.
-- Sem organizationId, zero chamadas Prisma encontradas no código server-side. Mesmo tratamento
-- de AIEvaluation: bloqueada por padrão até ser migrada para Document/DocumentChunk ou removida.
ALTER TABLE "KnowledgeDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KnowledgeDocument" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bypass_only_policy ON "KnowledgeDocument";
CREATE POLICY bypass_only_policy ON "KnowledgeDocument" FOR ALL
USING (current_setting('app.bypass_rls', TRUE) = 'on')
WITH CHECK (current_setting('app.bypass_rls', TRUE) = 'on');

-- 10. AiEngineSetting — CASO DIFERENTE dos demais: é uma config global por ferramenta
-- (toolKey @unique), não por tenant — por desenho, não tem organizationId. É lida/escrita em
-- src/features/intelligence/services/ai-settings.service.ts e ai.service.ts dentro de requests
-- autenticadas normais (não em contexto de bypass). Uma policy "bypass_only" quebraria a tela de
-- Consumo de IA para usuários comuns. A policy abaixo só exige "esta é uma conexão da própria
-- app com contexto de tenant setado" (ou bypass) — não isola por organização (não há o que
-- isolar), só bloqueia acesso direto via anon/authenticated do PostgREST do Supabase.
-- Autorização admin-vs-usuário-comum para ESCRITA nesta tabela continua sendo responsabilidade
-- da camada de rota (não encontrei checagem de role nas rotas hoje — vale revisar à parte).
ALTER TABLE "AiEngineSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiEngineSetting" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_context_policy ON "AiEngineSetting";
CREATE POLICY app_context_policy ON "AiEngineSetting" FOR ALL
USING (
    (
        current_setting('app.current_tenant_id', TRUE) IS NOT NULL
        AND current_setting('app.current_tenant_id', TRUE) <> ''
    )
    OR current_setting('app.bypass_rls', TRUE) = 'on'
)
WITH CHECK (true);

-- 11. ConversationSignal — tem organizationId próprio (obrigatório), padrão direto igual
-- Company/Contact/Lead/Activity.
ALTER TABLE "ConversationSignal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConversationSignal" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy ON "ConversationSignal";
CREATE POLICY tenant_isolation_policy ON "ConversationSignal" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
)
WITH CHECK (true);
