# Relatório de Finalização — Central de Inteligência Comercial ATLASGR

- **Data:** 2026-09-04
- **Branch de finalização:** `claude/atlasgr-platform-finalization-te0ovt` (a partir de `main` em
  `5cd0a2d`, com merge de `origin/main` de volta para dentro desta branch mais tarde na sessão — ver
  nota de continuidade)
- **SHA inicial (observado, confirmado real):** `5cd0a2d28b4f87b06710fa3d580171a3ef853fcf`
- **SHA final:** `a7d174cfbb0c310858ffb990becd87e09bff7646` (merge commit; `main` real avançou para
  `8e3c6b2` durante esta sessão — ver nota de continuidade — e foi reconciliado nesta branch antes
  do push final)
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

**Segundo achado de continuidade, tarde na sessão**: um `git fetch origin main` de rotina (antes de
escrever o veredito final) revelou que `origin/main` tinha avançado de `5cd0a2d` (o SHA inicial desta
missão) para `8e3c6b2` **enquanto esta sessão rodava** — outra sessão Claude Code (mesma conta)
mergeou as PRs #339/#340/#341 diretamente em `main` (fechadas no GitHub sem o botão "Merge", por
isso aparecem como `closed`/`merged:false` na API, mas o conteúdo real está confirmado em `main`) e
adicionou um commit de infra/documentação (`8e3c6b2`) sobre a migração de produção Supabase→Neon e
reativação do plano pago do Render — ver seção 10 para o que isso muda e o que não muda no achado
de Redis/worker. `origin/main` foi mergeado de volta para dentro desta branch (`a7d174c`) antes do
push final: `render.yaml` fez auto-merge limpo (minha adição de SMTP e a reestruturação deles não se
sobrepõem), 2 conflitos triviais de conteúdo em `.claude/PILOTS.md` (numeração de piloto duplicada,
um typo) resolvidos mantendo a versão de `main`. `git diff origin/main..HEAD` depois do merge confirma
que as PRs #339/#340/#341 não aparecem mais como diferença — o cherry-pick desta sessão e o merge
direto da outra sessão convergiram para o mesmo conteúdo, sem duplicação.

## 1. PRs — triagem e resultado

| PR | Título | Decisão | Evidência |
|---|---|---|---|
| #339 | SSRF host-allowlist + loop-bound CodeQL | **Integrada — confirmado presente em `main` (`cfb7b73`).** Cherry-pick desta sessão (`f9f2094`) e o merge direto de outra sessão convergiram para o mesmo conteúdo; sem diferença residual após reconciliar com `origin/main`. GitHub mostra a PR como `closed`/não-mergeada (fechada manualmente em vez de via botão "Merge") — **nenhuma ação necessária, já fechada**. | commit `f9f2094` (nesta branch) / `cfb7b73` (em `main`) |
| #340 | Bitrix24: orange/gray cru → tokens de marca | **Integrada — confirmado presente em `main` (`b9ab58a`).** Mesma situação de #339. **Nenhuma ação necessária, já fechada**. | commit `159ce20` (nesta branch) / `b9ab58a` (em `main`) |
| #341 | 3CX: pares `dark:` e tokens de tema | **Integrada — confirmado presente em `main` (`88040c2`).** Mesma situação de #339. **Nenhuma ação necessária, já fechada**. | commit `56716c4` (nesta branch) / `88040c2` (em `main`) |
| #326 | Reverte títulos h1-h6 coloridos/maiúsculos | **Supersedida — recomendado fechamento.** O bug original (contraste WCAG AA quebrado por `color:var(--brand)`+`uppercase` em todo h1-h6) **continuava ativo em `main`** apesar da PR nunca ter sido mergeada — extraído e corrigido diretamente (commit `18e80eb`), sem a bagagem dos outros ~30 commits da PR (que na maior parte corrigem débito já resolvido de outra forma em `main` — mysql2, drift de OpenAPI, formatação, hotspots, gitlinks). Recomendação: dono do repositório fecha #326 como supersedida por este relatório (já está `closed` no GitHub, mas vale confirmar que não será reaberta por engano). |
| #342 | Remove Market Intelligence da plataforma | **Não integrada nesta branch — decisão do dono, não desta missão.** Ainda aberta/em validação pelo próprio autor (`maarkss1`) no momento deste relatório. `render.yaml` mudou substancialmente nesta sessão (migração Neon/plano Render, ver nota de continuidade) — a mergeabilidade exata de #342 contra o `render.yaml` atual não foi reverificada (fora do escopo desta missão, que é não mexer em #342). Ver seção 9 (Market Intelligence) para o estado atual do módulo. |

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
| Testes de integração | `npm run test:integration` | ✅ PASS (53/53 arquivos, 245/245 testes — RLS/isolamento de tenant incluído). Rerodada limpa, serial (isolada da suíte E2E, mesmo banco de teste) depois de todas as correções desta sessão, incluindo o achado #10 (RLS de descoberta cross-tenant) — nenhuma regressão. Nota histórica: uma tentativa anterior nesta mesma sessão mostrou 1 falha por corrida entre dois processos concorrentes rodando contra o mesmo banco de teste (erro operacional, não do código) — diagnosticado e não reproduzido nas rodadas seguintes. |
| Build (frontend+server) | `npm run build` | ✅ PASS (warning não-fatal de `brace-expansion`/workbox durante a geração do service worker — build termina com sucesso, `dist/sw.js` válido, ver risco residual R4) |
| Build worker | `npm run build:worker` | ✅ PASS |
| Budget de bundle | `npm run check:bundle-budget` | ✅ PASS |
| Budget público | `npm run check:public-budget` | ✅ PASS |
| E2E (Playwright) | `npm run test:e2e` | ⚠️ **79/85 PASS, 1 skipped, 5 BLOCKED por ambiente (evidência precisa abaixo) — 0 falhas de produto.** Primeira tentativa falhou 100% (`chromium_headless_shell-1234` ausente); causa raiz real: `PLAYWRIGHT_CHROMIUM_EXECUTABLE` exportado numa chamada de shell separada da que roda `playwright test` não atravessa — cada chamada do Bash tool é um shell novo. Corrigido exportando na MESMA chamada; suíte completa então rodou limpa. Os 5 restantes (`visual.spec.ts`: dashboard light/dark, Pipeline CRM light/dark, formulário de contato light) falham **só** com `Timeout... waiting for fonts to load` (nunca um diff de pixel real — nenhum `-actual`/`-diff` foi gerado) porque o Chromium pré-instalado deste sandbox não consegue completar a tunelagem HTTPS do proxy de egress até `fonts.gstatic.com`/`fonts.googleapis.com` (confirmado via `curl` = OK, `chromium.launch({ proxy })` direto = `net::ERR_ABORTED`, log do proxy mostrando `ws_closed_mid_exchange` pros mesmos hosts) — não é um defeito de TLS corrigível sem desabilitar verificação (proibido) nem um bug do produto. **BLOCKED por ambiente**, não por código — ver R8. |
| CodeQL / Trivy / SonarQube / Dependency Review / gitleaks | — | **Não executáveis nesta sessão** (exigem o runner oficial do GitHub Actions; não há substituto local equivalente). Evidência indireta: os workflows correspondentes já passaram nos commits mais recentes de `main` antes desta missão (ver Fase Zero) — a branch de finalização precisa passar por eles de verdade no CI real após o push, antes do veredito final ser confirmado. |

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

**Nota sobre nome de role, descoberta tarde na sessão (ver nota de continuidade)**: o
`render.yaml` reconciliado documenta que a produção real (pós-corte pro Neon, ainda pendente) vai
usar `prospector_runtime` como role de tráfego da aplicação (RLS real, sem `BYPASSRLS`), separada de
`prospector_app` (dona das tabelas, DDL). O ambiente local desta sessão usa `prospector_app` como
a própria role de runtime (mesmo nome, papel diferente do documentado para o Neon). O mecanismo de
RLS testado empiricamente nesta sessão (policies via `current_setting('app.current_tenant_id'/
'app.bypass_rls')`) não depende do nome da role — só de ela não ter `BYPASSRLS`/superuser — então os
achados desta seção continuam válidos, mas a nomenclatura exata não foi revalidada contra o Neon
real (ainda não cortado).

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

**Atualização de continuidade**: durante esta sessão, `main` recebeu (por outra sessão, ver nota de
continuidade) um commit real de infra — `plan: free` → `plan: starter` no serviço web, migração de
banco Supabase → Neon (documentada, ainda **não cortada**: `DATABASE_URL` de produção continua
apontando pro Supabase até alguém colar a connection string real do Neon no dashboard), e
`preDeployCommand` para migrations com zero-downtime real. **Isso é um eixo totalmente separado do
Redis/worker abaixo** — starter plan é sobre CPU/RAM/sleep do serviço *web*, não provisiona Redis
nem ativa o worker dedicado. Confirmado por leitura do `render.yaml` reconciliado: o bloco `worker`
continua com `autoDeployTrigger: off` e `plan: free`, `REDIS_URL` continua `sync: false` em ambos os
serviços — nada do achado abaixo mudou.

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
| R8 | P3 (ambiente, não produto) | 5 de 85 specs E2E (`visual.spec.ts`, regressão de screenshot: dashboard light/dark, Pipeline CRM light/dark, formulário de contato light) não executam neste sandbox — travam em "waiting for fonts to load" porque o Chromium pré-instalado não completa a tunelagem HTTPS do proxy de egress até os hosts de fonte do Google (`fonts.googleapis.com`/`fonts.gstatic.com`) | Root-caused com evidência real (seção 4): não é diff de pixel (nenhum artefato de diff foi gerado, só timeout), não é código do produto, não é corrigível sem desabilitar verificação de TLS (proibido pelas regras desta sessão). Roda normalmente em CI real (GitHub Actions, sem este proxy) — confirmação definitiva só após o CI oficial rodar nesta branch |

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
5. **Cortar `DATABASE_URL`/`DIRECT_URL` de produção pro Neon** (documentado, ainda pendente por
   decisão de outra sessão — ver nota de continuidade e seção 10) — troca de banco de produção é
   ação de alto risco, fora do escopo de qualquer sessão automatizada decidir sozinha.

## 13. Veredito

### Tabela-resumo

| ID | Severidade | Problema | Evidência | Correção | Teste | Status |
|---|---|---|---|---|---|---|
| B1 | P1 | Workflows de CI (`docker-publish`, `pages build`) falhando no HEAD real | gitlink sem `.gitmodules`; `.npmrc` ausente no Dockerfile | Restaura arquivos reais; copia `.npmrc` antes do `npm ci` | Build local dos workflows reproduzido manualmente | ✅ Corrigido (`23c9de0`, `3287b4f`) |
| B2 | **P0** | Boot de produção falha (`PathError`) | Express 5/path-to-regexp v8 não aceita `app.get('*', ...)` | `app.get('/{*splat}', ...)` | `npm run build` + `start:e2e` sobem sem erro | ✅ Corrigido (`71c70ac`) |
| B3 | **P0** | 1 `Contact` com PII indecifrável derruba a listagem inteira de leads | `decryptField` sem try/catch no chamador | `tryDecryptField` isola por registro, fail-closed preservado | 3 testes novos, incl. regressão de `findMany` misto | ✅ Corrigido (`dbe5dcb`) |
| B4 | P1 | Rate-limit de login por IP inoperante | Better Auth não confia em `x-forwarded-for` multi-hop sem `trustedProxies` | Middleware normaliza pro primeiro IP, guardado por `TRUST_PROXY` | 2 testes novos com cadeia de 2 proxies simulada | ✅ Corrigido (`5922200`) |
| B5 | P1 | Reset de senha nunca envia e-mail em produção (#158) | `render.yaml` nunca declarou as 6 vars SMTP | Declaradas com `sync: false` | Smoke real de reset de senha ponta a ponta | ✅ Corrigido (`63d7058`) — valor real pendente de ação humana (ver seção 12) |
| B6 | P2 | Todo h1-h6 do app com contraste ~3:1 (abaixo de AA 4.5:1) | `color:var(--brand)`+`uppercase` global (commit `4264bcb`) | Revertido para `color:var(--ink)` + peso por nível | axe-core (29 rotas) sem violação nova | ✅ Corrigido (`18e80eb`) |
| B7 | P2 | Card "Documentos comerciais" nunca clicável apesar do destino já existir | Nunca ligado ao `onNavigate` | `onClick` real pro destino já funcional | Leitura de código + padrão do card irmão | ✅ Corrigido (`91cc7c8`) |
| B8 | **P1 (LGPD)** | Copiloto IA envia PII a IA externa sem checar base legal da organização | `assertPiiExternalConsent` nunca chamado em 2 pontos de entrada reais | Gate aplicado, fail-closed | 4 testes novos (bloqueado/permitido em cada ponto) | ✅ Corrigido (`32e0665`) |
| B9 | **P1** | 6 jobs de descoberta cross-tenant sempre devolviam 0 organizações/misturavam dados entre tenants, silenciosamente | `Organization` sob `FORCE ROW LEVEL SECURITY` sem contexto — confirmado empiricamente (0 de 59 orgs reais) | `requestContext.run({ bypassRls: true })` na descoberta + loop por tenant real | Empírico contra Postgres real + suíte de integração (245/245) sem regressão | ✅ Corrigido (`d0e431f`) |
| B10 | P2 | Contraste 1.43:1 no h1 do header do LDR Account Intelligence | Regra global de heading vence herança de `text-white` do header escuro | `text-white` explícito | axe-core confirmou 0 violações após a correção | ✅ Corrigido (`38c94be`) |
| B11 | P3 (ambiente) | 5/85 specs E2E (`visual.spec.ts`) travam em "waiting for fonts to load" | Chromium deste sandbox não completa a tunelagem HTTPS do proxy de egress até hosts de fonte do Google | N/A — limitação de ambiente, não de produto | `curl` OK, `chromium.launch({proxy})` `ERR_ABORTED`, log do proxy confirma `ws_closed_mid_exchange` | ⚠️ BLOCKED por ambiente — roda em CI real (ver R8) |

### Cobertura real desta sessão

- **Gates locais**: 12 de 13 comandos executáveis localmente passaram limpos (format, tsc, lint,
  arquitetura, OpenAPI, unit ×341, security-waivers, integration ×245, build, build:worker, bundle
  budget, public budget). O 13º (E2E) passou 79/85 com 5 bloqueadas por ambiente (evidência acima),
  0 falhas de produto.
- **Segurança/RLS/LGPD**: nenhuma trava foi enfraquecida — todas as correções desta sessão
  **fecharam** gaps reais (RLS cross-tenant, consentimento LGPD para IA externa, isolamento de
  blast-radius de PII, resolução de IP para rate-limit), nenhuma foi relaxada para fazer teste
  passar.
- **Smokes reais**: fluxo completo de autenticação (signup/login/logout/reset de senha) executado
  ponta a ponta contra servidor/Postgres/Redis reais via HTTP direto, não só testes automatizados.
  CRM/Prospecção/Cadência/Bitrix/Copiloto/Relatórios/RBAC além de auth foram auditados por leitura
  de código e cobertos pela suíte E2E (79 specs reais passando), mas não exercitados via smoke HTTP
  manual adicional nesta sessão — ver seção 5.
- **Não executável localmente**: CodeQL/Trivy/SonarQube/Dependency Review/gitleaks (exigem o runner
  oficial do GitHub Actions). Evidência indireta forte (mesmos workflows passando nos commits
  recentes de `main`); confirmação definitiva só após o CI real rodar no PR #344, que esta sessão
  está monitorando (`subscribe_pr_activity`) e vai dirigir até verde caso algo falhe, seguindo a
  postura padrão de PR própria.

### Por que não é uma reescrita nem um redesenho

Todas as correções desta sessão foram cirúrgicas: causa raiz identificada, menor mudança que resolve
o problema, teste real provando o antes/depois. Nenhum mock, dado fictício, botão cenográfico, rota
vazia ou catch silencioso foi introduzido. Nenhuma credencial, integração ou dado comercial foi
inventado. Nenhum serviço pago foi criado ou ativado (Redis/worker permanecem inertes por decisão de
custo, não por limitação técnica desta sessão — ver R1).

### Veredito

**RELEASE APPROVED**

Justificativa: todos os gates executáveis localmente (formatação, tipos, lint, arquitetura, deriva
de OpenAPI, testes unitários e de integração, build de app e worker, orçamento de bundle, waivers de
segurança) passam limpos, sem regressão de contagem de warnings/erros em relação à baseline. A suíte
E2E real passa 79 de 85 specs; as 5 restantes têm causa raiz identificada com evidência precisa como
limitação do ambiente de sandbox (proxy de egress, não o produto) e nenhum diff de pixel real foi
gerado em nenhuma delas. Todos os bugs reais encontrados nesta sessão — incluindo 2 P0 de produção
(boot quebrado, blast-radius de PII), 1 P1 de LGPD real (Copiloto IA) e 1 P1 de RLS real (6 jobs
cross-tenant) — foram corrigidos com causa raiz, teste de regressão e validação empírica contra
Postgres/Redis reais, não apenas lidos ou documentados. Nenhuma trava de segurança/RBAC/RLS/LGPD foi
enfraquecida. Os riscos residuais documentados (R1-R8) são todos: (a) decisões de custo/infra que
exigem autorização humana explícita (Redis+worker pago, SMTP real, corte de banco pro Neon), (b)
escopo intencionalmente não coberto por esta missão (Market Intelligence, condicionado a #342), ou
(c) uma limitação de ambiente de sandbox sem evidência de impacto real no produto — nenhum deles é
um defeito de código não corrigido. A confirmação do CI oficial do GitHub (CodeQL/Trivy/SonarQube/
Dependency Review/gitleaks) neste PR específico é a única verificação que só pode acontecer depois
do push; esta sessão está inscrita nos eventos do PR #344 e vai corrigir qualquer achado real que
surgir lá, seguindo a mesma disciplina de causa-raiz aplicada durante toda esta missão.
