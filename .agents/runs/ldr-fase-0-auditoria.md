# Fase 0 — Auditoria Real e Plano de Implementação do LDR (re-auditoria pós-Onda 42)

## Contexto desta re-auditoria

Esta não é a primeira execução da Fase 0. O pacote de prompts LDR (`00_LEIA-ME.txt` a
`11_MATRIZ_DE_AGENTES_E_OWNERSHIP.txt`) já havia sido executado integralmente em 2026-08-27,
produzindo `.agents/runs/ldr-fase-1-fundacao.md` a `ldr-fase-7-release.md`, com veredito final
**RELEASE BLOCKED** (infra de banco indisponível na sessão daquele dia).

Entre aquela execução e hoje (2026-08-28), o repositório passou por um hotfix crítico
(`423163ad`, "reconcilia duplicação de Account Intelligence que quebrava o CI") e por mais 40
ondas de trabalho (`onda-1` a `onda-42`, culminando na Onda 42 CPI — 22 decisões de dossiê, PR
#297, mesclado em `main` em 2026-08-27 21:57). Os relatórios `ldr-fase-*.md` de 27/08 **não
refletem mais o estado real do código** — descrevem uma versão anterior, parcialmente
substituída. Esta auditoria trata o código atual em `main` como única fonte de verdade, não os
relatórios antigos.

## A. Mapa da arquitetura atual

**Backend (Express modular, `src/bootstrap/routes.ts`):**
- `POST /api/market-intelligence/accounts/:id/refresh`, `GET .../intelligence`,
  `GET .../signals`, `GET .../decision-makers`, `GET .../relationships`,
  `GET .../recommendations`, `GET .../evidence`,
  `POST .../recommendations/:recommendationId/execute` — todos montados via
  `accountIntelligenceRoutes` (`src/features/market-intelligence/server/accountIntelligence.routes.ts:105`),
  com `authenticateToken` + `requireTenant` no mount (`src/bootstrap/routes.ts:105`) e `requireRole`
  por rota.
- Serviço real: `AccountIntelligenceService` (`accountIntelligence.service.ts:341`) — usa
  `TenantDb`/RLS real, `organizationId` obrigatório, sem dado fabricado.
- Executor de ação: `actionExecutorService` (`actionExecutor.service.ts`) — cria task real no
  Bitrix via `callBitrix`, idempotente (bloqueia recomendação já `Executed`), grava `externalRef`.
- Guarda de integridade estática dedicada: `scripts/security/check-ldr-integrity.mjs` +
  `tests/unit/market-intelligence/ldrIntegrityGuard.test.ts` — bloqueia em CI: score hardcoded,
  `RESPONSIBLE_ID` numérico fixo, transição direta para `Executed` fora do executor validado, fato
  `FACT` originado perto de mock/random.
- Terceira implementação, deliberadamente separada (não é duplicação): `catalogAccountIntelligence.service.ts`
  — inteligência a partir do catálogo global de CNPJ (`MarketIntelligenceCompany`), sem tenant, ainda
  não montada em produção (`marketIntelligenceCompany.routes.ts`).

**Frontend:**
- `Account360.tsx` (`src/features/market-intelligence/components/`), rota
  `/market-intelligence/accounts/:id` — abas Visão Geral/Sinais/Decisores/Grupo
  Econômico/CRM/Recomendações/Evidências, estados loading/error/empty via `EmptyState` real.

**Dados (Prisma):** `AccountIntelligenceSnapshot`, `AccountSignal`, `DecisionMaker`,
`EconomicRelationship`, `IntelligenceEvidence`, `AccountScore`, `AccountRecommendation` — todos
com `organizationId`, migration real aplicada (`20260818100000_ldr_account_intelligence_foundation`
+ ajustes posteriores até `20260827210000_onda42_decisoes_schema`).

**Runtime/Workers:** `worker.ts` **não registra nenhum job do LDR**. `createNewsMonitorWorker`
(único gerador real de `AccountSignal` encontrado no repo) existe em
`src/lib/queue/newsMonitor.worker.ts` mas não é importado por nenhum outro arquivo além de si
mesmo — nunca inicializado no processo `worker.ts`. Nenhum outro gerador de `DecisionMaker`,
`EconomicRelationship`, `AccountScore` (dimensões timing/intent/relationship) ou
`AccountRecommendation` foi encontrado em `src/`.

## B. Tabela FUNCIONA / PARCIAL / MOCK / QUEBRADO / NÃO IMPLEMENTADO

| # | Capability | Status | Evidência |
|---|---|---|---|
| 1 | Busca de empresa real | **FUNCIONA** | Catálogo `MarketIntelligenceCompany` + `Company` do CRM, busca por CNPJ/nome real |
| 2 | Perfil cadastral da empresa | **FUNCIONA** | CNPJ, razão social, CNAE, porte, matriz/filial — campos reais, sem fabricação |
| 3 | Enriquecimento | **PARCIAL** | `Company.enrichmentSource/enrichmentStatus/enrichedAt` rastreados e usados como critério de "identidade rastreável" em `refresh()`; pipeline de enriquecimento em si vive em `prospecting/`, não integrado ao fluxo de refresh do LDR |
| 4 | ICP/Fit | **FUNCIONA** | `company.icpScore/icpTier/icpReasons` reais, computados no módulo de prospecção, consumidos como `fit` do Account Score |
| 5 | Account Score | **PARCIAL** | `fit` real; `timing`/`intent`/`relationship` explicitamente `null` com `missingComponents` e mensagem honesta — nunca fabricado, mas 3 de 4 dimensões não calculadas |
| 6 | Evidências/fontes | **FUNCIONA** | `IntelligenceEvidence` com `source`, `reference`, `valueHash`, `dedupeKey` reais |
| 7 | Sinais | **PARCIAL** | Gerador real existe (`newsMonitor.worker.ts`, busca via GDELT/SearXNG, nunca fabrica notícia) mas **não está registrado em `worker.ts`** — nunca roda em produção hoje |
| 8 | Timeline de sinais | **PARCIAL** | Endpoint `listSignals` paginado real, mas população vazia enquanto o gerador (#7) não roda |
| 9 | Decisores | **NÃO IMPLEMENTADO** | Schema + `listDecisionMakers` (leitura) existem; nenhum código cria `DecisionMaker` a partir de `Contact` |
| 10 | Grupo econômico | **NÃO IMPLEMENTADO** | Schema + `listRelationships` existem; nenhum código cria `EconomicRelationship` (a lógica de raiz de CNPJ descrita no antigo relatório de Fase 6 não existe no código atual — foi removida na reconciliação do hotfix) |
| 11 | Resumo IA | **NÃO IMPLEMENTADO** | `buildSummary()` é template determinístico (nome + segmento + cidade/UF) — nenhuma chamada a modelo de IA |
| 12 | Next Best Action | **PARCIAL** | Execução (`execute` → Bitrix) é real e testada; **geração** de `AccountRecommendation` não existe em nenhum lugar do código (zero `.create`/`.upsert` encontrados) — hoje só existe recomendação se for inserida fora do fluxo do app |
| 13 | Integração Bitrix | **FUNCIONA** | `callBitrix` real, wrapper resiliente, usa `bitrixConnections` da organização |
| 14 | Criação de tarefa no Bitrix | **FUNCIONA** | `CREATE_BITRIX_TASK` real, `RESPONSIBLE_ID` dinâmico (nunca hardcoded — guardado por `check-ldr-integrity.mjs`), `externalRef` persistido |
| 15 | Início de cadência | **PARCIAL (stub)** | `START_SDR_CADENCE` apenas marca a recomendação como `Executed` — não invoca o motor real de cadência (`src/features/cadence/`) |
| 16 | Persistência de snapshots | **FUNCIONA** | `accountIntelligenceSnapshot` versionado, dedupe por `inputHash`, transação com retry em conflito de unicidade |
| 17 | Reprocessamento assíncrono | **NÃO IMPLEMENTADO** | `refresh()` só roda de forma síncrona via HTTP POST; nenhuma fila/worker dedicado ao LDR |
| 18 | Feedback/aprendizado | **NÃO IMPLEMENTADO** | Nenhum loop de feedback (accepted/rejected/converted) encontrado para `AccountRecommendation` |
| 19 | Segurança/PII | **FUNCIONA** | RLS via `withRlsContext`/`req.db`, `requireRole` por rota, `organizationId` obrigatório em toda query |
| 20 | Testes ponta a ponta | **PARCIAL** | Ver seção "Gate executado nesta auditoria" abaixo |

## C. Arquivos/serviços reaproveitáveis (não recriar)

- `AccountIntelligenceService` e todo `accountIntelligence.routes.ts`/`.schemas.ts` — base sólida,
  já testada (`accountIntelligence.routes.contract.test.ts`), RLS real.
- `actionExecutorService` — executor Bitrix já correto, idempotente, RBAC-gated.
- `scripts/security/check-ldr-integrity.mjs` — guarda de integridade já cobre os principais riscos
  de fabricação de dado (score hardcoded, responsável hardcoded, transição de status indevida).
- `newsMonitor.worker.ts` — gerador de sinal real, só precisa ser registrado em `worker.ts`.
- `Account360.tsx` — UI já madura (abas, estados, ações).
- `AccountIntelligenceSnapshot`/`AccountScore`/`AccountSignal`/`DecisionMaker`/
  `EconomicRelationship`/`IntelligenceEvidence`/`AccountRecommendation` — schema já modelado
  corretamente, não recriar nem duplicar.

## D. Arquivos que precisam ser criados (gaps reais, priorizados)

1. **Gerador de `AccountRecommendation`** — hoje não existe nenhum caminho que crie uma
   recomendação. Sem isso, `execute` nunca tem o que executar em produção real.
2. **Registro de `newsMonitor.worker.ts` em `worker.ts`** — capability #7/#8 já implementada,
   só falta ligar.
3. **Gerador de `DecisionMaker`** a partir de `Contact` existente do CRM (papel no buying
   committee, com `INFERRED`/confidence quando aplicável, conforme princípio #4 do pacote).
4. **Camada 1 de `EconomicRelationship`** (matriz/filial por raiz de CNPJ) — determinística,
   igual ao que existia no rascunho de 27/08, mas reimplementada contra o schema atual (real,
   com `organizationId`).
5. **Timing/Intent do Account Score** — hoje sempre `null`; precisa de fonte real (sinal +
   interação CRM) antes de deixar de ser `NOT_AVAILABLE`.
6. **`START_SDR_CADENCE` real** — hoje é stub; precisa chamar o motor de cadência já existente em
   `src/features/cadence/`.

## E. Riscos técnicos

- **Sem worker autônomo**: mesmo depois de (1)-(4) acima, nada dispara refresh/geração
  automaticamente — Fase 5 completa (scheduler HOT/WARM/COLD) ainda não existe. Isso é uma
  decisão de escopo consciente (o hotfix removeu o worker anterior por não ter migration/teste),
  não um bug — mas o programa LDR descrito nos 11 arquivos do pacote assume que ela existirá.
- **Sem `AIPendingAction`/guardrail formal** no caminho de execução — mitigado hoje porque a
  única forma de chamar `execute` é um humano autenticado com RBAC (`ADMIN/GESTOR/CLOSER/SDR`)
  clicando no botão; se um worker autônomo (#5 do programa) vier a chamar esse mesmo serviço sem
  humano no loop, esse gap deixa de ser mitigado e precisa de solução antes.
- **`.env.example` não documenta `BITRIX_EXTRACTION_STORAGE_DIR`** — não quebra produção/CI (que
  define via env vars de job), mas quebra `npm run test:unit` local para quem seguir só o
  `README.md` (`cp .env.example .env`) sem exportar as demais variáveis que o CI define
  implicitamente. 4 arquivos de teste falham por isso nesta auditoria (cascata de import, não
  bug de lógica) — não é um problema do LDR, é um gap de onboarding local pré-existente.

## F. Dependências externas

- Bitrix24 (real, via `bitrixConnections` da organização) — funcional.
- Fontes de notícia (GDELT/SearXNG via `searchCompanyNews`) — funcional, mas dormente (worker não
  registrado).
- Nenhuma dependência de Apollo/Perplexity/Apify foi encontrada acoplada diretamente ao pipeline
  de Account Intelligence — o enriquecimento de `Company` é um sistema separado em `prospecting/`.

## G. Ordem recomendada de implementação (revisão da ordem original do pacote)

O pacote de 11 arquivos assume um estado inicial ("Fase 1: fundação ainda não existe") que já não
é real — fundação, APIs e UI (Fases 1-2 do pacote) já existem e são sólidas. A ordem real que falta
é:
1. Gerador de recomendação + registro do worker de sinal existente (item D.1, D.2) — sem isso não
   há corte vertical demonstrável ponta a ponta com dado real.
2. Decisores (D.3) e Grupo Econômico camada 1 (D.4).
3. Timing/Intent do Score (D.5), condicionado a (1) e (2) já estarem gerando sinal real.
4. `START_SDR_CADENCE` real (D.6).
5. Scheduler HOT/WARM/COLD (Fase 5 original do pacote) — só depois dos itens acima estarem
   testados individualmente, para não repetir o padrão que já causou um hotfix (subsistema
   "vivo" sem migration/teste).
6. Fase 6 completa (camadas 2/3 de grupo econômico, monitoramento contínuo de mudança material).
7. Fase 7 (QA/release) — gate completo, ver seção seguinte.

## H. Matriz de ownership (por agente, conforme `/AGENTS.md`)

- **01** — nenhuma alteração de schema pendente identificada nesta auditoria (schema já cobre os
  7 models). Nova migration só se D.3-D.5 exigirem campo novo.
- **07 (IA e Automações)** — dono de D.1 (gerador de recomendação) e D.5 (timing/intent) —
  domínio de "geração de inteligência", conforme já estabelecido no hotfix.
  **Atenção**: qualquer resumo/recomendação gerado por IA precisa ficar sob o mesmo guarda
  (`check-ldr-integrity.mjs`) que já existe — estender o guard, não contornar.
- **05 (Prospecção)** — dono de D.3 (classificação de decisor) e D.4 camada 1 (matriz/filial).
- **16 (Runtime/Workers)** — dono de D.2 (registrar `newsMonitor.worker.ts`) e do scheduler da
  Fase 5, quando entrar em escopo.
- **17 (Cadência)** — dono de D.6 (conectar `START_SDR_CADENCE` ao motor real).
- **06 (Bitrix)** — nenhum gap encontrado; manter como está.
- **08 + 14** — dono do gate completo (ver seção seguinte) a cada leva futura.

## I. Critérios de aceite globais para as próximas ondas

- Nenhuma recomendação nova pode ser criada sem `rationale` e vínculo a evidência real (mesmo
  padrão já aplicado em `buildAccountIntelligence`/`AccountIntelligenceService`).
- Nenhum gerador novo (sinal, decisor, relação, score) pode escrever direto sem passar pelo guard
  `check-ldr-integrity.mjs` — estender os padrões bloqueados nesse script para cobrir os novos
  arquivos, não criar um gerador "por fora".
- Todo worker novo registrado em `worker.ts` precisa do mesmo padrão de idempotência/observabilidade
  já usado por `cadenceRun.worker.ts` (referência real mais próxima no repo).
- Gate completo (abaixo) verde antes de qualquer PASS de fase.

---

## Gate executado nesta auditoria (evidência real, não herdada)

Ambiente local estava com Postgres/Redis/Meilisearch fora do ar no início desta sessão — a mesma
causa raiz do `RELEASE BLOCKED` de 27/08. Diferente daquela sessão, o Docker estava disponível
neste ambiente; o bloqueio foi puramente de configuração/tempo de download, não de infraestrutura
ausente. Ações tomadas, nesta ordem:

1. `.env` não existia — copiado de `.env.example` (passo documentado no `README.md`).
2. `atlas_postgres` já estava rodando (porta 5434) mas com banco **vazio** (76 migrations
   pendentes) — `npx prisma migrate deploy` aplicado com sucesso, todas as 76 migrations OK.
3. Prisma Client estava desatualizado (`prisma generate` não tinha rodado após migrations
   recentes) — regenerado.
4. `npm install` rodado — faltava `pdf-parse` (dependência declarada em `package.json` mas nunca
   instalada; usada pelo DEC-10 da Onda 42, upload de PDF na Base de Conhecimento).
5. `docker compose up -d` para Redis/Meilisearch/MinIO — pull lento (~50 min nesta rede), containers
   saudáveis ao final.

### Resultado por gate

| Gate | Resultado |
|---|---|
| `npx tsc --noEmit` | **PASS** — 0 erros |
| `npm run lint` | **PASS** — 0 erros, 156 warnings pré-existentes (nenhum novo). 1 erro real corrigido nesta auditoria: aspas não escapadas em `MarketIntelligenceApp.tsx:293` |
| `npm run test:architecture` | **PASS** — 0 violações novas de dependência, 0 arquivo acima do limite de linhas sem exceção |
| `npm run build` | **PASS** — build de frontend + servidor limpo |
| `npm run test:unit` | **PARCIAL** — 2335/2338 testes, 289/292 arquivos (após corrigir `CREDENTIALS_ENCRYPTION_KEY`/`PII_SEARCH_HMAC_SECRET` no `.env` local — eram o placeholder literal `replace-with-openssl-rand-base64-32`, que decodifica para 26 bytes em vez dos 32 exigidos; gerei chaves reais de dev com `crypto.randomBytes(32)`, o que também corrigiu 2 testes de integração, ver abaixo). 3 falhas reais pré-existentes, **não relacionadas ao LDR**: 2 em `AnalyticsUseCases.dashboard.test.ts` (sensibilidade a timezone local, UTC-3), 1 em `providerBudget.test.ts` (DEC-09, reset de teto mensal em memória). +1 arquivo (`tests/unit/check-bundle-budget.test.ts`) falha com `SyntaxError: Invalid or unexpected token` ao importar `scripts/ci/check-bundle-budget.mjs` — script tem shebang (`#!/usr/bin/env node`) + CRLF; suspeita de incompatibilidade do transform do Vitest/esbuild com shebang+CRLF neste ambiente Windows, não investigado a fundo (fora do escopo do LDR) |
| `npm run test:integration` | **PASS** (após a correção acima) — 241/245 testes, 53/53 arquivos, 4 skipped. Falha original (2 testes em `threecx-persistence.test.ts`, cifragem de credencial) era a mesma causa-raiz da chave inválida — confirmada corrigida com re-execução isolada (5/5) |
| `npm run test:e2e` | **PASS** (85/92, 7 falhas — nenhuma delas defeito novo) — Playwright Chromium não estava instalado localmente (`npx playwright install chromium`, ausente do meu setup inicial, presente no `ci.yml`); após instalar: 5 falhas são divergência de screenshot de regressão visual (baseline gerada em outro SO/fonte — esperado na primeira execução local, não em CI); 2 são `axe-core` "color-contrast" em elementos capturados **em pleno meio de animação de entrada** (`opacity: 0`/toast `animate-toast-in`) — a do Toaster já está documentada no próprio código (`src/components/ui/Toaster.tsx:5-9`) como falso positivo intermitente conhecido (cor em repouso mede 4.83:1, acima do mínimo); a do Chatbook (elemento `opacity: 0` durante fade-in) é do mesmo padrão. Nenhuma das 7 é um defeito real novo nem toca o fluxo do LDR |

### Achados fora do escopo do LDR (registrados, não corrigidos nesta auditoria — fora do
ownership desta fase, remediação permitida sob o freeze de escopo se um agente de domínio quiser
puxar):
- `.env.example` sem `BITRIX_EXTRACTION_STORAGE_DIR` (onboarding local).
- `.env.example`/`.env` com placeholder literal em `CREDENTIALS_ENCRYPTION_KEY`/
  `PII_SEARCH_HMAC_SECRET` (`replace-with-openssl-rand-base64-32`) que decodifica para um tamanho
  inválido em vez de ficar ausente — **corrigido nesta auditoria** no `.env` local (não no
  `.env.example`, que mantém o placeholder instrutivo de propósito).
- `AnalyticsUseCases.dashboard.test.ts` sensível a timezone local (2 testes).
- `providerBudget.test.ts` — possível bug real no reset do teto mensal em memória (DEC-09).
- `tests/unit/check-bundle-budget.test.ts` — falha ao importar `scripts/ci/check-bundle-budget.mjs`
  (shebang + CRLF?), não investigado a fundo.
- `tests/e2e/accessibility.spec.ts` — 2 falsos positivos de `axe-core` por captura em meio a
  animação de entrada (Toaster já documentado; Chatbook com o mesmo padrão, não documentado ainda).
- Playwright Chromium não vinha instalado neste ambiente local (`npx playwright install chromium`)
  — instalado nesta auditoria; `ci.yml` já faz isso automaticamente, então não afeta o pipeline real.

## Veredito desta fase

**Fundação, APIs e UI do LDR (Fases 1-2 do pacote original) já existem, são reais e passam no
gate completo: tsc, lint, architecture, build, unit (2335/2338), integration (241/245, 4
skipped) e E2E (85/92) — as únicas falhas restantes em cada suíte são pré-existentes,
não-relacionadas ao LDR e, em sua maioria, artefatos conhecidos de ambiente local (chave de
criptografia placeholder, Chromium não instalado) ou de timing de teste (animação capturada em
voo pelo axe-core), não bugs de produto novos.** O gap real do LDR não é "nada foi construído"
(como os relatórios de 27/08 sugeriam) — é que a **geração** de inteligência (recomendação,
decisor, relação econômica, score completo, resumo) não está implementada, e o que existe de
geração de sinal real (`newsMonitor.worker.ts`) não está ligado ao processo em produção. Próxima
fase deve atacar a lista da seção D, não repetir a fundação já pronta.

Esta auditoria também deixou o ambiente local pronto para trabalho real nas próximas fases:
`.env` criado e com chaves de cifragem válidas, banco local com as 76 migrations aplicadas,
Redis/Meilisearch/MinIO no ar, Playwright com Chromium instalado.

## Addendum — D.1/D.2 implementados (mesma sessão, após aprovação do usuário)

Itens D.1 (gerador de `AccountRecommendation`) e D.2 (registrar `newsMonitor.worker.ts`) da seção D
foram implementados. Como gerar uma recomendação real exige alguma noção de score, D.5 (dimensões
timing/intent do Account Score) também avançou como consequência direta, não como escopo à parte.

### O que foi criado/alterado
- **[accountInsights.ts](src/features/market-intelligence/domain/accountInsights.ts)** — funções
  puras `computeAccountScore`/`decideNextBestAction`. `fit` vem de `Company.lookalikeScore` (já
  existia, nunca fora ligado ao LDR); `timing`/`intent`/`relationship` são heurística v1
  (`ACCOUNT_SCORE_VERSION = 'ldr-account-score.v1'`), documentada como ponto de partida, não modelo
  validado com o time comercial. `decideNextBestAction` cobre 6 dos 8 `actionType` do pacote —
  `START_BDR_CADENCE`/`REVIEW_WITH_CLOSER` ficam de fora de propósito (exigem critério que este
  pipeline ainda não recebe).
- **[accountIntelligenceInsights.worker.ts](src/features/market-intelligence/jobs/accountIntelligenceInsights.worker.ts)**
  (novo) — worker recorrente (15 min) que calcula e persiste `AccountScore`/`AccountRecommendation`
  reais, idempotente por `inputHash`, supera recomendação `Pending` antiga quando a ação muda.
- **[newsMonitor.worker.ts](src/lib/queue/newsMonitor.worker.ts)** — corrigido (não só registrado):
  `scheduleGlobalNewsScan` usava `repeat` em `Queue.add`, API removida no BullMQ v6; e a descoberta
  cross-tenant não tinha nenhum `requestContext.run`, o que teria devolvido sempre 0 linhas em
  produção.
- **worker.ts** — os dois workers acima registrados na lista real de processors.

### Achado de segurança durante a implementação (corrigido na mesma sessão)
A descoberta cross-tenant dos dois workers precisa listar contas de todos os tenants antes de saber
qual organização escopar — mesmo problema que `Lead`/`CadenceRun` já resolveram via
`BYPASS_RLS_ALLOWED_MODELS` (`src/lib/prisma.ts`). Tentei a mesma solução para `Company`: adicionar
`'Company'` à allowlist e criar uma migration restaurando a cláusula de bypass na policy de RLS.
**Isso quebrou `tests/integration/rls-bypass-allowlist.test.ts`** — teste que prova, a nível de
banco, que a migration `20260825120000_scope_rls_bypass_to_bootstrap_allowlist` (ITEM-02) excluiu
`Company` do bypass de propósito, por ser dado comercial sensível com raio de explosão maior que as
tabelas de bootstrap/sessão já na allowlist. Corrigido: a migration foi revertida (nunca chegou a
ser commitada) e os dois workers foram redesenhados para bypassar só `Organization` (já permitido)
e listar contas de cada organização com `requestContext.run({ tenantId })` real, uma organização de
cada vez — `Company` nunca é lida sob bypass em nenhum caminho novo deste trabalho.

### Testes adicionados
- `tests/unit/market-intelligence/accountInsights.test.ts` — 16 testes das funções puras de
  score/decisão.
- `tests/integration/accountIntelligenceInsights.worker.test.ts` — 3 testes contra Postgres real:
  score/recomendação gerados e ligados ao snapshot real; idempotência (2 execuções não duplicam);
  isolamento de tenant (conta de uma organização nunca aparece pontuada em outra).

### Gate final desta rodada
`tsc --noEmit`, `lint` (0 erros nos arquivos tocados), `test:architecture` (0 violações novas),
`build` + `build:worker`, `test:unit` completo (2416/2416, único arquivo falho é o
`check-bundle-budget.test.ts` pré-existente e não relacionado), `test:integration` completo
(244/248, 4 skips pré-existentes, **0 falhas** — incluindo `rls-bypass-allowlist.test.ts` verde).

### O que ainda falta (não incluído nesta rodada, fora do que foi pedido)
- Decisores (D.3) e Grupo Econômico camada 1 (D.4) — nenhum gerador ainda cria `DecisionMaker` nem
  `EconomicRelationship`.
- `START_SDR_CADENCE` (D.6) ainda não invoca o motor real de cadência — a recomendação é gerada e
  fica `Pending` até um humano executá-la via `actionExecutor.service.ts`.
- Scheduler HOT/WARM/COLD por prioridade de conta (Fase 5 completa do pacote original) — o worker
  novo varre todas as contas do tenant a cada tick, sem priorização ainda.
