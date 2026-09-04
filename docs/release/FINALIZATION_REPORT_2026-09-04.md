# Relatório de Finalização — Central de Inteligência Comercial ATLASGR

- **Data:** 2026-09-04
- **Branch de finalização:** `claude/atlasgr-platform-finalization-te0ovt` (a partir de `main`)
- **SHA inicial (observado, confirmado real):** `5cd0a2d28b4f87b06710fa3d580171a3ef853fcf`
- **SHA final:** ver `git log -1` no HEAD desta branch no momento do push (relatório escrito com o
  HEAD em `32e0665`, mais os commits do gate final registrados após esta seção ser fechada).
- **Executor:** sessão autônoma Claude Code (Fable 5.1, com uma troca para Sonnet 5 no meio da
  sessão — ver nota de continuidade abaixo).
- **Critério:** código real > comportamento real > testes reais > configuração real > documentação
  recente > roadmap antigo.

## Nota de continuidade da sessão

Esta missão foi executada em duas fases do modelo dentro da mesma sessão: iniciada em Claude Fable
5.1, com o usuário trocando explicitamente para Claude Sonnet 5 no meio do trabalho (`/model
claude-sonnet-5`). Todo o trabalho reportado aqui — incluindo a Fase Zero, a triagem de PRs e todas
as correções — foi verificado e, na maior parte, executado sob Sonnet 5, com contexto integral da
Fase Zero preservado da sessão anterior.

Um bloqueador operacional real também ocorreu: um workflow de auditoria paralela (12 agentes
simultâneos via `Workflow`) foi lançado no início da missão e morreu inteiramente por limite de
sessão da conta ("You've hit your session limit"), antes de produzir qualquer achado utilizável.
A partir daí, toda a auditoria e correção deste relatório foi conduzida **sequencialmente, sem
spawns paralelos adicionais** — mais lenta, mas sem essa classe de falha recorrer.

## 1. PRs — triagem e resultado

| PR | Título | Decisão | Evidência |
|---|---|---|---|
| #339 | SSRF host-allowlist + loop-bound CodeQL | **Integrada** (cherry-pick dos 3 commits reais, revalidada contra `main` atual) | commit `f9f2094` |
| #340 | Bitrix24: orange/gray cru → tokens de marca | **Integrada** (cherry-pick dos 2 commits reais, 1 conflito trivial de append em `PILOTS.md` resolvido) | commit `159ce20` |
| #341 | 3CX: pares `dark:` e tokens de tema | **Integrada** (cherry-pick limpo, auto-merge sobre o novo estado pós-#340 de `Integrations.tsx`) | commit `56716c4` |
| #326 | Reverte títulos h1-h6 coloridos/maiúsculos | **Supersedida — recomendado fechamento.** O bug original (contraste WCAG AA quebrado por `color:var(--brand)`+`uppercase` em todo h1-h6) **continuava ativo em `main`** apesar da PR nunca ter sido mergeada — extraído e corrigido diretamente (commit `18e80eb`), sem a bagagem dos outros ~30 commits da PR (que na maior parte corrigem débito já resolvido de outra forma em `main` — mysql2, drift de OpenAPI, formatação, hotspots, gitlinks). Recomendação: dono do repositório fecha #326 como supersedida por este relatório. |
| #342 | Remove Market Intelligence da plataforma | **Não integrada nesta branch — decisão do dono, não desta missão.** Draft, ainda em validação pelo próprio autor (`maarkss1`). Não toca nenhum arquivo desta branch de finalização exceto `render.yaml` (duas linhas não-conflitantes: eu adicionei variáveis SMTP, a PR #342 remove o seed de Market Intelligence do `startCommand` — mergeável em qualquer ordem sem conflito semântico). Ver seção 9 (Market Intelligence) para o estado atual do módulo. |

## 2. Issues — triagem e resultado

| Issue | Título | Status | Evidência |
|---|---|---|---|
| #157 | INCIDENTE: login e redefinição de senha indisponíveis em produção | **Parcialmente reproduzido e corrigido.** Login/sessão/logout funcionam corretamente (reproduzido ponta a ponta contra Postgres/Redis reais). O warning real de rate-limit ("Rate limiting could not determine a client IP") foi reproduzido, causa raiz identificada (Better Auth não confia em `x-forwarded-for` multi-hop sem `trustedProxies`) e corrigido — commit `5922200`. O "Invalid password" original (18/08) não foi possível reproduzir contra produção real (sem credenciais de produção) — mas nenhuma causa raiz de login em si foi encontrada no código atual; o candidato mais provável era a mesma classe de bug de resolução de IP recém-corrigida. |
| #158 | INCIDENTE: login e redefinição de senha indisponíveis em produção (duplicata de #157) | **Causa raiz real encontrada e corrigida.** Reset de senha funciona tecnicamente ponta a ponta (token gerado, usado, single-use, rejeição de senha antiga — todos confirmados). **`render.yaml` nunca declarou nenhuma das 6 variáveis SMTP** — o e-mail de redefinição nunca foi configurável no dashboard do Render, então nunca foi enviado em produção. Corrigido (commit `63d7058`); configurar o valor real é ação humana (ver seção 10). Recomendação: fechar como duplicata de #157 após #157 fechar, ou fechar as duas juntas citando este relatório. |
| #304 | Reconstruir smokes nacionais de Market Intelligence | **Fica em aberto, condicionado à decisão sobre #342.** Se #342 mergear (módulo removido), #304 fica obsoleta por completo — fechar citando a remoção. Se o dono decidir manter o módulo, #304 continua sendo débito técnico real e válido, fora do escopo desta missão (não é bloqueador de release do core CRM/Prospecção/Copiloto). |

## 3. Bugs encontrados, causa raiz e correção

| # | Severidade | Achado | Causa raiz | Correção | Commit |
|---|---|---|---|---|---|
| 1 | P1 | Workflow `Publish private container image` e `pages build and deployment` falhando no HEAD observado | `public/tools/hub-inteligencia-marketing` e `public/tools/social-selling` commitados como gitlink (submódulo) sem `.gitmodules` — checkout novo sempre vazio | Cherry-pick do fix já validado em CI pela PR #326 (commit `7d62dce`), copiando só os arquivos referenciados pelos componentes React reais | `23c9de0` |
| 2 | P1 | Mesmo workflow, segunda causa: `npm ci --ignore-scripts` falha com ERESOLVE (`mem0ai` vs `@types/pg`) | Dockerfile não copiava `.npmrc` (`legacy-peer-deps=true`) antes do `npm ci` | `COPY package*.json .npmrc ./` | `3287b4f` |
| 3 | **P0** | Servidor de produção falha no boot: `PathError: Missing parameter name at index 1: *` | Express 5 (path-to-regexp v8) não aceita mais `app.get('*', ...)` — CI nunca detectou porque `NODE_ENV=test` cai no branch de dev do Vite, nunca no fallback de produção | `app.get('/{*splat}', ...)` — sintaxe oficial do Express 5 | `71c70ac` |
| 4 | **P0** | Um único `Contact` com PII indecifrável (chave diferente/dado corrompido) derrubava a QUERY INTEIRA — confirmado em produção: listagem de leads inteira quebrada (`PrismaLeadRepository.findAllWithFilters` → `LeadController.getLeads`) | `decryptField` sem nenhum `try/catch` no chamador (`decryptSensitiveRecord`/`decryptNestedContactPii`), lançando para fora de `$allOperations` do Prisma | `tryDecryptField` isola o dano por registro (marcador não-PII, nunca fail-open), loga sem PII/chave. Fail-closed do `decryptField` em si **não foi alterado** | `dbe5dcb` |
| 5 | P1 | Rate limit de login por IP inoperante em produção — warning real "Rate limiting could not determine a client IP" | Better Auth lê `x-forwarded-for` por conta própria (não usa `req.ip` do Express); sem `trustedProxies`, um header com mais de 1 IP é tratado como não confiável | Middleware que normaliza `x-forwarded-for` multi-hop para o primeiro valor (convenção do próprio cabeçalho), guardado por `TRUST_PROXY` — sem precisar adivinhar CIDR do proxy do Render | `5922200` |
| 6 | P1 | Reset de senha nunca envia e-mail em produção (issue #158) | `render.yaml` nunca declarou as 6 variáveis SMTP — nunca visíveis no dashboard para configurar | Declaradas com `sync: false` (não ativa nada sozinho) | `63d7058` |
| 7 | P2 | Todo h1-h6 da aplicação inteira (não só login) usa `color:var(--brand)` + `uppercase` — contraste ~3:1, abaixo do mínimo AA 4.5:1 | Commit `4264bcb` aplicou a regra globalmente em vez de só na tela de login | Revertido para `color:var(--ink)` + peso por nível; telas de login/seleção de marca já tinham override próprio, não afetadas | `18e80eb` |
| 8 | P2 | Card "Documentos comerciais" do Cockpit CRM nunca clicável, mesmo com destino real e funcional (`/app/propostas`) já existente | Nunca foi ligado ao `onNavigate` depois que a tela de propostas foi construída (Piloto 030) | `<button onClick={() => onNavigate('propostas')}>`, mesmo padrão do card irmão | `91cc7c8` |
| 9 | **P1 (LGPD)** | Copiloto IA envia áudio real (Whisper) e transcrição real de conversa (extração de objeções/coaching) a provedores de IA externos sem checar a base legal LGPD da organização | `assertPiiExternalConsent` (mesmo gate que já protege WhatsApp/SDR/Ops/Learning/Supervisor) nunca foi aplicado em `transcribeConversation.worker.ts` nem em `CopilotoVoiceIngestionAdapter.ts` — confundido com o consentimento de GRAVAÇÃO do participante, um eixo LGPD diferente | Gate aplicado nos dois pontos, fail-closed, mesmo padrão do resto da plataforma | `32e0665` |
| 10 | **P1** | 4 jobs/serviços que descobrem organizações cross-tenant (`stagnation-scanner.service.ts`, `winLossAnalysis.worker.ts`, `swarmScheduler.service.ts::enabledOrganizations`, `coldCall.service.ts::enabledOrganizations`) chamavam `prisma.organization.findMany()` **sem nenhum contexto de RLS** — confirmado empiricamente contra Postgres real (59 organizações reais no banco de teste, a chamada sem contexto devolvia 0). Mais grave em 2 casos: `dailyExecutiveSummary.worker.ts`/`deduplication.worker.ts` liam `Lead`/`Contact` cross-tenant sem NENHUM filtro de `organizationId`, além de também sempre devolverem 0 linhas — cada um desses 6 jobs "completava com sucesso" sem processar nada, sem nenhum erro, silenciosamente, sempre | `Organization` está sob `FORCE ROW LEVEL SECURITY` (migration `20260722020322_enable_rls`) igual a Company/Contact/Lead/Activity — "não é tenant-scoped" (não tem `organizationId`, ELA é o tenant) foi confundido com "sem RLS" em pelo menos 4 comentários diferentes do código, um erro de entendimento repetido, não um caso isolado | Descoberta agora sempre via `requestContext.run({ bypassRls: true }, ...)` (`Organization` já está no allowlist documentado, `BYPASS_RLS_ALLOWED_MODELS` em `src/lib/prisma.ts`); os 2 workers mais graves foram reescritos para loop por organização com `requestContext.run({ tenantId })` real, mesmo padrão já usado corretamente em `accountIntelligenceInsights.worker.ts`/`agentMemoryCleanup.worker.ts`/`bitrixExtractionPurge.worker.ts`/`newsMonitor.worker.ts` | `d0e431f` |
| 11 | P2 | `h1` do header escuro em `LdrAccountIntelligence.tsx` (Market Intelligence) com contraste 1.43:1 (mínimo AA pra texto grande é 3:1) — achado real do axe-core (`accessibility.spec.ts`), não teórico | Regra global `h1 { color: var(--ink) }` (@layer base) mira o elemento diretamente e sempre vence sobre uma cor herdada de um ancestral (`text-white` estava no `<header>` pai, nunca chegava ao `<h1>` por herança porque uma regra de tag mais específica já mirava o próprio elemento) | `text-white` explícito no `h1`, já que ele vive sobre `bg-atlas-dark` (fundo escuro fixo, não reativo a tema) | `38c94be` |

## 4. Resultado dos gates (comando → status)

Executados na branch de finalização, contra Postgres 16 (pgvector) + Redis 7 + Meilisearch reais
locais (Docker), migrations aplicadas, papel `prospector_app` (NOSUPERUSER) bootstrapado.

| Gate | Comando | Status |
|---|---|---|
| Format | `npm run format:check` | ✅ PASS |
| TypeScript | `npx tsc --noEmit` | ✅ PASS (0 erros) |
| Lint | `npm run lint:ci` | ✅ PASS (587 warnings pré-existentes na baseline inicial; 585 após todas as correções desta sessão — leve redução, sem nenhum warning novo introduzido) |
| Arquitetura | `npm run test:architecture` | ✅ PASS (0 violações novas fora da baseline `.dependency-cruiser-known-violations.json`) |
| Deriva OpenAPI | `npm run verify:openapi-drift` | ✅ PASS (252 paths documentados, 0 deriva — nenhuma rota nova/alterada nesta sessão) |
| Testes unitários | `npm run test:unit` | ✅ PASS (341/341 arquivos, 2695/2695 testes na rodada final desta sessão, incluindo os testes de regressão novos desta missão — LGPD/Copiloto IA, `tryDecryptField`, normalização de `x-forwarded-for`) |
| Waivers de segurança | `npm run security:audit-waivers` | ✅ PASS (3 achados HIGH/CRITICAL, todos cobertos por waiver ativo em `docs/security/AUDIT_WAIVERS.md` — este script já roda `npm audit --audit-level=high --json` internamente) |
| `npm audit` (standalone) | `npm audit --audit-level=high` | ⚠️ **Não concluído — achado de ambiente, não de código.** Travou >4min sem terminar (processo morto manualmente), enquanto o mesmo `npm audit --audit-level=high --json` embutido no gate anterior rodou normalmente e passou. Evidência real usada para o veredito é o gate `security:audit-waivers` acima, que cobre exatamente o mesmo achado. |
| Testes de integração | `npm run test:integration` | ✅ PASS (53/53 arquivos, 245/245 testes — RLS/isolamento de tenant incluído). Nota: uma primeira tentativa mostrou 1 falha por corrida entre dois processos concorrentes rodando contra o mesmo banco de teste (erro operacional desta sessão, não do código) — banco de teste recriado do zero e suíte rerodada isolada, resultado acima é o limpo. |
| Build (frontend+server) | `npm run build` | ✅ PASS (warning não-fatal de `brace-expansion`/workbox durante a geração do service worker — build termina com sucesso, `dist/sw.js` válido, ver risco residual R4) |
| Build worker | `npm run build:worker` | ✅ PASS |
| Budget de bundle | `npm run check:bundle-budget` | ✅ PASS |
| Budget público | `npm run check:public-budget` | ✅ PASS |
| E2E (Playwright) | `npm run test:e2e` | *(ver atualização abaixo — em execução no momento em que esta linha foi escrita)* |
| CodeQL / Trivy / SonarQube / Dependency Review / gitleaks | — | **Não executáveis nesta sessão** (exigem o runner oficial do GitHub Actions; não há substituto local equivalente). Evidência indireta: os workflows correspondentes já passaram nos commits mais recentes de `main` antes desta missão (ver Fase Zero) — a branch de finalização precisa passar por eles de verdade no CI real após o push, antes do veredito final ser confirmado. |

*(Esta tabela é atualizada com o resultado real do E2E assim que a suíte em background termina —
ver continuação abaixo desta seção, antes do push final.)*

## 5. Smokes reais executados

Todos contra servidor Express real (`npx dotenv-cli -e .env.test -- npx tsx server.ts`), Postgres
16 (pgvector) + Redis 7 reais, via HTTP direto (`curl`), não apenas testes automatizados.

| Fluxo | Resultado |
|---|---|
| Sign-up (criação de conta real) | ✅ 200, cookie de sessão emitido |
| Login (sign-in) | ✅ 200, sessão válida |
| Sessão (`get-session`) | ✅ retorna usuário/organização reais |
| Logout (`sign-out`) | ✅ sessão invalidada (`get-session` → `null` depois) |
| Solicitar redefinição de senha (`request-password-reset`) | ✅ 200, resposta genérica correta (sem enumeração de e-mail), token gerado e logado (SMTP indisponível localmente, comportamento de fallback correto — ver achado #6) |
| Usar token de redefinição (`reset-password`) | ✅ 200, senha alterada |
| Login com senha NOVA | ✅ sucesso |
| Login com senha ANTIGA (pós-reset) | ✅ corretamente rejeitado (401) |
| Reuso do mesmo token de reset | ✅ corretamente rejeitado (400 — single-use) |
| Normalização de `x-forwarded-for` multi-hop | ✅ confirmado via teste automatizado com `TRUST_PROXY=true` e supertest simulando cadeia de 2 proxies |

**Não executados nesta sessão** (por escopo/tempo, não por decisão de pular verificação — ver seção
"O que falta" abaixo): CRM (criar/editar empresa/contato/lead, mover etapa, atividades),
Prospecção→promover, Cadência (criar/iniciar/pausar/retomar/cancelar), Bitrix24 bidirecional,
Google/WhatsApp/3CX, Copiloto IA (lista/detalhe/lead/aprovação), RAG/Base de Conhecimento,
Relatórios/Forecast/Jornada, Treinamento AtlasGR, Configurações/Equipe/RBAC, Notificações, mobile
Capacitor. Estes fluxos foram auditados por leitura de código (rotas, RBAC, RLS — ver seções 3, 6, 8)
mas não exercitados via smoke HTTP real nesta sessão.

## 6. RLS e multi-tenancy — verificação sistemática

Além do spot-check por leitura, esta sessão rodou uma varredura sistemática e **empírica** (não só
teórica) contra o Postgres real deste worktree:

1. `grep` de `requestContext`/`prisma\.` nos 23 arquivos `*.worker.ts` do projeto — sinalizou 3
   arquivos com chamada Prisma direta e zero referência a `requestContext` (achado #10).
2. `grep` repo-wide de `prisma.organization.findMany`/`prisma.lead.findMany` (os dois models no
   allowlist de bypass, usados pra descoberta cross-tenant) — 49 ocorrências revisadas uma a uma;
   mais 3 arquivos sinalizados sem `requestContext.run({ bypassRls: true })` envolvendo a
   descoberta (achado #10).
3. Confirmação empírica direta: script contra o Postgres real do worktree (`prisma.organization
   .findMany()` sem contexto nenhum → 0 organizações devolvidas, com 59 reais no banco de teste;
   com `requestContext.run({ bypassRls: true }, ...)` → 59, correto). Não foi uma inferência sobre
   a policy SQL, foi uma execução real.

Resultado: 6 arquivos corrigidos (achado #10, commit `d0e431f`) — `stagnation-scanner.service.ts`,
`winLossAnalysis.worker.ts`, `swarmScheduler.service.ts`, `coldCall.service.ts`,
`dailyExecutiveSummary.worker.ts`, `deduplication.worker.ts`. Confirmados **corretos** sem alteração
(mesmo padrão `bypassRls`-só-pra-descoberta + `tenantId` real pro resto):

- `accountIntelligenceInsights.worker.ts`, `agentMemoryCleanup.worker.ts`,
  `bitrixExtractionPurge.worker.ts`, `newsMonitor.worker.ts`, `threecx.service.ts` — descoberta de
  `Organization` já corretamente sob bypass.
- `forecastSnapshotWeekly.worker.ts`: mesmo padrão, RLS real por tenant no resto — **correto**.
- `bitrixSync.worker.ts` → `runBitrixSyncTick()`: mesmo padrão, com um gotcha real já documentado
  no próprio código (lazy `PrismaPromise` fora do escopo do `.run()` perdendo o `AsyncLocalStorage`)
  — **correto e com regressão já prevenida por comentário/handoff anterior**.
- `coldCall.worker.ts`/`swarmScheduler.worker.ts`: delegam pra `enabledOrganizations()` dos
  respectivos services (já corrigidos acima), não tocam Prisma diretamente.
- `dailyReport.worker.ts`/`whatsappCommand.worker.ts`/`whatsappSignal.worker.ts`: processam um job
  com `organizationId` já conhecido (webhook/evento específico), não fazem descoberta cross-tenant
  — nenhum padrão de risco aplicável.
- `secretFields.ts`/`piiFields.ts`/`prisma.ts` (achado #4 desta sessão): a correção de
  blast-radius **não** relaxou RLS nem `bypass_rls` em nenhum ponto — `decryptField` continua
  fail-closed, sem nenhuma mudança de comportamento na cifra em si.

**Código morto encontrado, não corrigido (só documentado)**: `src/lib/queue/stalledLead.worker.ts`
tem o mesmo bug do achado #10 (`prisma.lead.findMany` sem contexto) mas **não é importado por
nenhum lugar do produto** (nem `bootstrap/workers.ts` nem `worker.ts` na raiz) — foi superado por
`stagnation-scanner.service.ts` (que já cobre o mesmo gatilho `Lead_Estagnado`) sem que o arquivo
antigo fosse removido. Zero impacto em produção; recomendação de limpeza na seção 11 (R7), não
removido nesta sessão para não decidir uma exclusão de código fora do pedido explícito do usuário.

**Ainda não lido linha a linha nesta sessão** (fora do padrão específico varrido acima): a lógica
interna completa de cadence/WhatsApp/relatórios que já roda dentro de um `requestContext.run`
correto (não foi reauditada por trás do `.run()`, só a entrada). Risco residual reclassificado na
seção 11 (R3), com escopo bem mais estreito do que a versão anterior deste relatório.

## 7. Segurança — SSRF/safeFetch

PR #339 (integrada, commit `f9f2094`) confirma: `fetchWithTimeout`/`fetchWithProviderRetry` ganham
`allowedHosts` opcional (aditivo); todo call site real de provedor de prospecção (Apollo, Hunter,
GitHub, Google, YouTube, BrasilAPI, Nominatim) declara seu host esperado; os 3 serviços
auto-hospedáveis (Meilisearch/SearXNG/Voicebox) validam contra o próprio host configurado, não uma
lista fixa. URLs de tenant (webhook Bitrix24, PABX 3CX) continuam passando por `safeFetch`/
`assertSafeExternalUrl` (`src/shared/security/urlGuard.ts`, DNS pinning), não por `fetchWithTimeout`
— caminho separado, não tocado por esta PR, e não reauditado a fundo nesta sessão além de confirmar
que a PR não o modifica.

## 8. Copiloto IA e cadeia de IA

Ver achado #9 (seção 3) — o gap real encontrado e corrigido. Confirmado por leitura (não
exaustivamente testado em runtime real com provedor de IA de verdade, que exigiria credencial e
geraria custo real):

- RBAC: `COPILOTO_IA_ROLES` aplicado tanto no mount de rotas (`bootstrap/routes.ts`) quanto na
  rota de frontend (`RequireRole` em `App.tsx`) — defesa em profundidade confirmada.
- `organizationId`: presente em toda query do módulo lida nesta sessão.
- Circuit breaker de orçamento: `assertAiBudgetNotExceeded()` chamado explicitamente no worker de
  transcrição (Whisper não passa por `getAiModel()`, que já tem o circuit breaker embutido).
- Consentimento de gravação (eixo diferente do LGPD-IA-externa corrigido nesta sessão): máquina de
  estados `PENDING/GRANTED/DECLINED/NOT_REQUIRED` já existente e correta, verificada nesta sessão
  como distinta e complementar ao gate agora aplicado.

**Não verificado nesta sessão**: validação Zod de output estruturado em todos os pontos do módulo,
timeouts/retry/fallback específicos do Copiloto, aprovação humana antes de writeback no Bitrix
(`CopilotoBitrixWritebackUseCases` — existe no código, não reexecutado nesta sessão).

## 9. Market Intelligence

Módulo permanece presente em `main` (PR #342 do próprio dono do repositório, removendo-o
inteiramente, ainda em draft/validação — não integrada aqui, não é decisão desta missão). Nenhuma
alteração feita neste módulo nesta sessão. Issue #304 permanece condicionada à decisão sobre #342
(ver seção 2).

## 10. Worker/runtime — filas e Redis em produção

Achado confirmado por leitura de código + evidência real de log de produção (Render):

- `render.yaml` (serviço `prospector-atlas`, web): `ENABLE_QUEUES: "false"`, `REDIS_URL` declarada
  como `sync: false` (nunca preenchida no Blueprint). O padrão recorrente
  `Error: connect ECONNREFUSED 127.0.0.1:6379` / `ETIMEDOUT ::1:6379` nos logs de produção confirma
  que `REDIS_URL` genuinamente **não está configurada** — `redisUrl` cai no fallback hardcoded
  `redis://localhost:6379` (`src/lib/queue/redis.ts`).
- Isso é **coerente com o design documentado** (`queuesEnabled` calcula `false` quando
  `redisConfigured=false`, independente de `ENABLE_QUEUES`) — não é uma regressão de código.
  `retryStrategy` retorna `null` quando não habilitado (guard já existente do incidente de
  29/08/2026 documentado no próprio arquivo), então **não há tempestade de reconexão** — só
  tentativas isoladas quando algo tenta genuinamente enfileirar um job (ex.: enriquecimento
  assíncrono ao criar uma empresa/lead pela UI).
- **Efeito real em produção**: todo recurso que depende de fila/worker fica inerte —
  enriquecimento assíncrono em lote, sincronização automática do Bitrix (a cada 15min), scanners de
  leads frios/estagnados, snapshot semanal de forecast, limpeza de memória de agentes, expurgo de
  extrações Bitrix. O serviço `prospector-atlas-worker` (dedicado, `worker.ts`) está definido em
  `render.yaml` mas com `autoDeployTrigger: off` — nunca foi ativado de fato.
- **Não é um bloqueador que o código deste release possa resolver sozinho** — exige (a) provisionar
  Redis gerenciado (ex.: Render Key Value, custo real) e (b) ativar o serviço worker dedicado
  (também custo real, plano pago). Ambos exigem autorização humana explícita de gasto, fora do
  escopo desta sessão.

## 11. Riscos residuais (não corrigidos nesta sessão, documentados)

| # | Severidade | Risco | Por que não foi corrigido agora |
|---|---|---|---|
| R1 | Operacional | Filas/worker inertes em produção (seção 10). **Importante**: mesmo depois de resolvido, os 6 jobs do achado #10 (agora corrigidos) e o resto do runtime de fila continuam dependendo disso — ativar Redis/worker sozinho não reativa nada que dependa de RLS quebrado, porque isso já foi corrigido nesta sessão | Exige provisionar Redis + ativar serviço pago — decisão humana de gasto |
| R2 | Operacional | SMTP declarado mas sem valor real configurado (achado #6) | Exige credencial SMTP real — ação humana |
| R3 | P3 | RLS: a entrada (descoberta cross-tenant) de todo `*.worker.ts` e de todo call site de `organization.findMany`/`lead.findMany` repo-wide foi varrida sistematicamente e corrigida (achado #10, seção 6) — o que resta não verificado é a lógica interna de cada job **depois** de já estar dentro de um `requestContext.run` correto (não reauditada linha a linha) | Escopo reduzido em relação à versão anterior deste relatório — a superfície de maior risco (descoberta sem contexto nenhum) já foi coberta de forma sistemática e verificada empiricamente contra Postgres real |
| R4 | P3 | Warning não-fatal `brace_expansion_1.expand is not a function` durante `vite build` (geração do service worker via `workbox-build`) | Build continua com `EXIT=0` e o `dist/sw.js` gerado é válido (confirmado por inspeção) — causa raiz provável é o override global `brace-expansion@^2.0.1` em `package.json` vs. `minimatch@10` (usado por `workbox-build`/`glob` mais recentes) exigindo `brace-expansion@^5`; não investigado a fundo por não ser bloqueador |
| R5 | P2 | Issue #157 ("Invalid password") não 100% fechada — causa raiz de login em si não localizada no código atual, só a causa raiz do sintoma adjacente (rate-limit) | Sem acesso a credenciais de produção reais para reproduzir o incidente original exatamente como ocorreu em 18/08 |
| R6 | P3 | `docker-publish.yml`/`pages build and deployment` corrigidos localmente mas não reexecutados no runner real do GitHub Actions | Exige push + execução real do workflow — só confirmável após o push desta branch |
| R7 | P4 | `src/lib/queue/stalledLead.worker.ts` é código morto (não importado por `bootstrap/workers.ts` nem `worker.ts`), superado por `stagnation-scanner.service.ts`, mas continua no repositório com o mesmo bug de RLS do achado #10 | Zero impacto em produção (nunca executa); remoção é uma decisão de limpeza fora do pedido explícito desta missão — recomendado, não executado |

## 12. Ações externas necessárias (fora do alcance do código)

1. **Configurar SMTP real** no dashboard do Render (`SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/
   `SMTP_PASS`/`SMTP_FROM`/`SMTP_SECURE`) — sem isso, reset de senha continua não enviando e-mail em
   produção, mesmo com o código corrigido.
2. **Decidir sobre Redis + worker dedicado** (seção 10) — provisionar Redis gerenciado e ativar
   `prospector-atlas-worker` é gasto real, exige autorização explícita do dono do produto.
3. **Fechar/reabrir issues e PRs** conforme recomendação das seções 1 e 2, após revisão humana deste
   relatório.
4. **CodeQL/Trivy/SonarQube/Dependency Review/gitleaks reais** só rodam de verdade no CI oficial do
   GitHub Actions após o push — confirmar verde lá antes do veredito final ser considerado definitivo.

## 13. Veredito

*(Seção final escrita depois de todos os gates do CI local terminarem — ver push e PR abertos ao
final desta missão para o estado real e definitivo, incluindo confirmação do CI oficial do GitHub.)*
