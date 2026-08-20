# Auditoria — IA, enxame, guardrails e evaluation (AI-001..011)

Sprint 07 / Onda 20. Auditoria real (5 investigações paralelas independentes, cada uma lendo o
código-fonte diretamente) do estado atual de cada entrega do roadmap
`SPRINT-07-IA-ENXAME-EVALUATION.md` contra o que existe implementado e conectado em produção.

**Onda 30 (rodada "resolver todas as pendências")**: AI-011 (budget/circuit breaker) construído —
ver seção "AI-011 — circuit breaker de orçamento mensal (onda 30)" abaixo.

**Onda 31 (mesma rodada)**: AI-003 (persistência honesta de AgentMemory) construído — ver seção
"AI-003 — persistência honesta de AgentMemory (onda 31)" abaixo.

**Onda 32 (mesma rodada)**: AI-002 (checkpointer persistente do LangGraph) construído — ver seção
"AI-002 — checkpointer real de LangGraph (onda 32)" abaixo.

**Onda 33 (mesma rodada)**: AI-007 fechado por completo (parte 2 — gate de consentimento LGPD no
enxame BDR/Closer/CRM) — ver seção "AI-007 (parte 2) — gate de consentimento no enxame (onda 33)"
abaixo.

**Onda 34 (mesma rodada)**: AI-010 (RAG com proveniência real) construído — ver seção "AI-010 —
citação real e rastreável no Copiloto Técnico (onda 34)" abaixo.

As tabelas de "Resumo por item" e "Achados documentados como pendência" foram atualizadas para
refletir as cinco correções acima; as demais seções deste documento (AI-001, 004-006, 008-009)
continuam descrevendo o estado da onda 20 original.

## Resumo por item

| Item | Corrigido nesta sprint | Estado real |
|---|---|---|
| AI-001 Nomes canônicos dos SDRs | Sim | `sdr-agent.ts`→`sdrOutboundDraft.agent.ts`, `sdr.agent.ts`→`sdrQualification.agent.ts` |
| AI-002 Checkpointer persistente | Sim (onda 32) | `PostgresSaver` real (`@langchain/langgraph-checkpoint-postgres`) substitui `MemorySaver` nos 3 grafos com checkpointer; estado sobrevive a restart/deploy |
| AI-003 Persistência de memória honesta | Sim (onda 31) | Upsert atômico único (`sessionId`, `agentType`, `organizationId`) com unique constraint real; nenhum caminho de escrita engole mais erro; `GET /agents/sdr/status/:sessionId` distingue pending/completed/failed |
| AI-004 Structured output obrigatório | Sim | Fallback textual (nunca validado por Zod) não pode mais autoExecute |
| AI-005 Golden Dataset | Não | Não existe; `verify:ai` é smoke test de conectividade, não evaluation harness |
| AI-006 Métricas de avaliação | Não | Só 3/9 dimensões capturadas (cost, latency, human override); as demais 6 não têm nada |
| AI-007 Base legal/consentimento | Sim (fechado onda 33) | Gate fail-closed em TODO caminho que envia texto a um provedor de IA externo: `AIService.qualifyLead`, SDR/Ops (onda 20) e, desde a onda 33, `BaseAgent.run`/`runWithTools` (BDR/Closer/CRM) |
| AI-008 Classificação de ferramentas | Sim | Já estava correto (onda 7); contagem desatualizada na doc corrigida |
| AI-009 SLO por agente | Sim | Fonte de dados e UI já existiam (onda 7); rota HTTP nunca registrada — corrigido |
| AI-010 RAG com proveniência | Sim (fechado onda 34) | `/knowledge/copilot` chama `hybridSearch` real no servidor; citação final é resolvida de metadado real (documentId/chunkId/score) do hit correspondente, nunca texto livre do LLM |
| AI-011 Budget/circuit breaker | Sim (onda 30) | `AI_MONTHLY_BUDGET_USD` agora bloqueia novas chamadas de IA de verdade ao ser atingido (soma global de `AILog.cost` do mês, cacheada); ver seção própria abaixo |

## Achados corrigidos nesta rodada

### AI-004 — Bug ativo de segurança: autoExecute sem validação de schema

`SDROutboundDraftAgent.draftEmailForLead` (`sdrOutboundDraft.agent.ts`) podia enviar e-mail real de
forma totalmente autônoma (`SWARM_AUTONOMY_MODE=full` + score do lead acima do limiar + janela
comercial aberta) usando um fallback de texto livre que **nunca passou pela validação Zod**
(`emailDraftSchema`) — exatamente o bypass que o roadmap proíbe explicitamente ("fallback textual
pode ser exibido/revisado, nunca executado externamente de forma autônoma").

**Corrigido**: `isStructuredOutputValid` é rastreado e persistido em `AIPendingAction.payload`;
`autoExecute` só prossegue quando o schema foi validado com sucesso, tanto na criação quanto no
reaproveitamento de uma ação existente (fail-closed para registros anteriores a esta correção, sem
o campo). Testes: `sdrOutboundDraft.agent.test.ts` (3 casos novos).

### AI-002 — Colisão de checkpoint entre organizações

`thread_id` do LangGraph não era qualificado por tenant em nenhum dos 3 grafos com `MemorySaver`
singleton de módulo (`sdrQualification.agent.ts`, `ops.agent.ts`, `supervisor.agent.ts`/enxame). Nas
rotas `POST /swarm/mission`/`POST /swarm/stream`, `sessionId` vem cru do corpo da requisição — duas
organizações que mandassem o mesmo valor reaproveitariam o checkpoint em RAM uma da outra.

**Corrigido**: `thread_id` agora é `${organizationId}:${sessionId}` nos 3 pontos. **Não corrigido**:
o checkpointer continua `MemorySaver` (RAM, perdido a cada restart/deploy) — construir um backend
persistente (`@langchain/langgraph-checkpoint-postgres` ou equivalente) é feature nova, fora do
escopo desta correção pontual.

### AI-007 — Gap de consentimento LGPD no fluxo de maior volume

`AIService.qualifyLead` (`leadQualificationGraph`, disparado por `createLeadsWorker` — o caminho
padrão de qualificação de TODO lead) enviava o nome real do contato a Groq/OpenAI sem nenhuma
checagem de base legal/consentimento, ao contrário de SDR Outbound/SDR Autônomo/Ops Agent, que já
tinham essa trava desde a onda 7.

**Corrigido**: mesmo gate fail-closed (`hasPiiExternalConsent`) adicionado ao ponto de entrada.
Teste: `ai.service.qualifyLead.test.ts` (3 casos). Nesta rodada da auditoria (onda 20), os agentes
BDR/Closer/CRM do enxame (disparados pelo scheduler 24/7 ou por missão manual no
`SwarmDashboard.tsx`) continuavam sem gate — fechado depois, onda 33, ver "AI-007 (parte 2) — gate
de consentimento no enxame (onda 33)" mais abaixo.

### AI-009 — Rota de SLO nunca registrada

Achado confirmado por duas auditorias independentes e por um handoff já aberto
(`.agents/handoffs/onda-7/13-para-07-rota-slo-swarm.md`): a fonte de dados
(`getSwarmSloSnapshot`) e a UI (`SwarmDashboard.tsx`, aba "SLO por agente") existiam desde a onda 7,
com testes próprios, mas a rota `GET /api/agent/swarm/slo` nunca foi adicionada a
`agent.routes.ts` — em produção, a aba sempre caía num estado de erro explícito.

**Corrigido**: rota registrada, exatamente como o handoff já especificava. Teste:
`agent.routes.slo.test.ts` (4 casos).

### AI-001 — Rename mecânico

`sdr-agent.ts`→`sdrOutboundDraft.agent.ts` (classe `SDROutboundDraftAgent`, rascunho de e-mail),
`sdr.agent.ts`→`sdrQualification.agent.ts` (classe `SDRQualificationAgent`, qualificação
multi-turn via LangGraph). Nomes de classe já eram claros — a ambiguidade era só no arquivo.
Blast radius totalmente mapeado pela auditoria antes do rename: 3 imports de código real
(`agent.worker.ts`, `supervisor.agent.ts`, `intelligence.routes.ts`) + 2 arquivos de teste + docs
vivas (`COMPLIANCE_MATRIX.md`, `SDR_VOZ_AUDITORIA_E_OPT_OUT.md`) atualizados. Registros históricos
em `.agents/handoffs/`, `.agents/prompts/` e `.agents/runs/` de sprints anteriores foram
deliberadamente preservados sem edição — são atas, não documentação viva.

### AI-008 — Já resolvido, doc desatualizada corrigida

A classificação por impacto das 9 ferramentas do enxame já tinha sido feita e fechada na onda 7
(`.agents/runs/onda-7.md`, "Leva 4"): nenhuma tool executa ação externa de alto impacto
diretamente; a única ação externa real (`sendEmail`) sempre passa por `AIPendingAction`. Só a
contagem em `.agents/completion/02-mapa-plataforma.md` estava desatualizada ("8 ferramentas" vs 9
reais) — corrigida, com a tabela de classificação completa adicionada.

## Achados documentados como pendência (não corrigidos — construção de feature ou decisão de produto, fora do escopo de correção pontual)

| Item | Situação real | Por que não construído nesta sprint |
|---|---|---|
| AI-005 (Golden Dataset) | Não existe nenhum dataset sanitizado/versionado para os 8 casos de uso pedidos | Construção de feature nova completa (curadoria de dataset + harness de avaliação) |
| AI-006 (métricas de avaliação) | Só cost/latency/human-override capturados; factualidade/aderência/tool-correctness/hallucination/PII-leakage-rate/fallback-rate não têm nada | Depende de AI-005 (dataset) para a maioria; construção de feature nova |

## Gate final
- typecheck: `npx tsc --noEmit` — limpo, 0 erros
- lint: `npm run lint` — 0 erros, 82 warnings (mesmo nível pré-existente da onda anterior)
- unit: `npx vitest run -c vitest.unit.config.ts` — **169/169 arquivos, 1313/1313 testes**
- integration: `npx dotenv-cli -e .env.test -- npx vitest run -c vitest.integration.config.ts`
  (Postgres + Redis reais) — **33/33 arquivos, 140/140 testes**
- build: `npm run build` e `npm run build:worker` — ambos limpos
- `npm run verify:ai` (gate específico do roadmap): não é um evaluation harness real hoje (ver
  AI-005) — não executado como gate bloqueante nesta rodada, mesmo status de antes (já roda com
  `continue-on-error: true` no CI)
- e2e: não executado nesta rodada (nenhuma mudança de UI)

## Riscos restantes

| Risco | Dono | Motivo do aceite | Revisar em |
|---|---|---|---|
| `followUp.worker.ts` pode estar processando sempre 0 leads em produção (mesmo padrão de RLS sem contexto encontrado e corrigido no worker de cadência na onda 19) | 16 (runtime/workers) | Não investigado nesta rodada — outro worker, outra feature, merece verificação própria | Próxima rodada que tocar follow-up de WhatsApp, prioridade alta |
| Orçamento de IA é GLOBAL (soma de todas as organizações), não por tenant — uma organização de alto consumo pode bloquear IA para todas as outras | 13 (enxame) | `AI_MONTHLY_BUDGET_USD` já era um único valor escalar antes do AI-011; orçamento por tenant exige coluna/tabela nova, fora do escopo da correção de onda 30 | Se algum tenant reclamar de bloqueio causado por outro tenant |
| Tabelas do checkpointer LangGraph (`checkpoints`/`checkpoint_writes`/`checkpoint_blobs`) não têm RLS — isolamento de tenant é só o prefixo de `thread_id` | 01 (plataforma) + 07 (IA) | Pacote de terceiros fala SQL cru fora da extensão RLS-aware do Prisma; mesmo modelo de confiança já aceito para BullMQ/Redis neste repo | Se um dia houver acesso direto a essas tabelas por um papel/serviço não confiável |
| Checkpoints se acumulam indefinidamente — sem política de TTL/limpeza | 07 (IA) | `deleteThread()` existe no pacote, mas decidir a política de retenção e construir o job agendado é feature própria | Quando o volume de linhas em `checkpoints` justificar priorizar |
| `GRANT CREATE ON DATABASE ... TO prospector_app` (necessário para `PostgresSaver.setup()`, ver `scripts/db/create-app-role.sql`) precisa ser aplicado manualmente no Postgres de produção (Supabase) antes do primeiro deploy desta correção — o script de bootstrap não roda automaticamente contra produção | 16 (SRE/deploy) | Achado real do CI desta rodada (onda 32); sem esse GRANT em produção, a primeira chamada de IA que passar por um dos 3 grafos com checkpointer falha | Antes do deploy do PR de AI-002, confirmar o GRANT foi aplicado |
| BDR/Closer/CRM (onda 33) ganharam o gate binário de consentimento, mas não minimização de PII (troca de valor real por token reversível, como `minimizePii`/`rehydratePii` já fazem para SDR) — quando uma organização TEM consentimento registrado, o texto livre da missão ainda pode conter um nome/e-mail/telefone real sem pseudonimização antes de ir ao provedor externo | 07 (IA) + 01A (LGPD) | Diferente do SDR (que busca um Contact estruturado e sabe exatamente qual string é o nome do titular), BDR/Closer/CRM recebem texto livre sem nenhum campo estruturado — não há como identificar com segurança o que é PII no texto para tokenizar, sem um passo de NER/heurística próprio, feature nova | Se a organização com consentimento registrado operar rotineiramente com PII sensível (não só nome/cargo) no texto da missão |
| AI-010 (onda 34) fecha a proveniência das CITAÇÕES (`sourceReferences` só aponta para chunk real, nunca texto inventado), mas não verifica a FACTUALIDADE do resto da resposta (`directAnswer`/`technicalSpecifications`) contra o conteúdo citado — o LLM ainda pode escrever um dado técnico que não está em nenhum dos trechos fornecidos, mesmo citando corretamente o trecho de onde partiu | 07 (IA) | Verificar se cada afirmação da resposta está de fato sustentada pelo texto citado (grounding real, não só citação) é o mesmo problema de "factualidade"/"hallucination rate" que AI-006 já mapeia como métrica de avaliação ainda não construída — depende do harness de AI-005/AI-006, não é uma correção pontual de wiring como esta | Quando AI-005/AI-006 (evaluation harness) forem priorizados |

## AI-011 — circuit breaker de orçamento mensal (onda 30)

**Decisão de produto** (tomada explicitamente antes da implementação, resolvendo a pergunta em
aberto que travava este item desde a onda 20 — "o que 'cortar' significa"): exceder
`AI_MONTHLY_BUDGET_USD` **bloqueia** novas chamadas de IA (não degrada para outro modelo, não é só
notificação passiva).

**Construído**: `src/lib/ai/budget.ts` — `assertAiBudgetNotExceeded()`, chamada em
`getAiModel().invoke()` (`gateway.ts`, cobre os ~34 call sites que já passam pelo gateway central) e
em `BaseAgent.runWithTools()` (`base.agent.ts`, o único caminho que fala direto com
LangChain/Groq via `buildModelWithFallback`, usado por BDR/Closer). Sem `AI_MONTHLY_BUDGET_USD`
configurada, é sempre um no-op — mesmo comportamento "sem teto" de antes.

O custo do mês é a soma real de `AILog.cost` (mesma fonte de `usageService.summary`/
`GET /api/usage`) em **todas as organizações** — orçamento é global, não por tenant, porque
`AI_MONTHLY_BUDGET_USD` já era um único valor escalar antes desta correção (diferente de outros
pares flag+allowlist-por-organização do repo, como `SWARM_SCHEDULER_ORGANIZATIONS`); orçamento por
tenant exigiria uma coluna/tabela nova, fora do escopo. Essa soma cross-tenant precisa de bypass de
RLS — `AILog` entrou em `BYPASS_RLS_ALLOWED_MODELS` (`src/lib/prisma.ts`) só para esta ÚNICA query
agregada (`_sum: { cost: true }`, nunca uma linha, nunca um `organizationId` específico devolvido a
ninguém). Cacheado por 60s (Redis, com fallback em memória local se o Redis cair) para não pagar um
`aggregate` no Postgres a cada chamada de IA.

Falha ao CALCULAR o custo (Postgres indisponível) é tratada como "custo desconhecido", nunca como
"orçamento excedido" — decisão deliberada: um Postgres fora do ar não deveria derrubar toda a
superfície de IA do produto, um raio de impacto maior que o problema que este circuit breaker existe
para prevenir.

Observabilidade: `ai_budget_blocked_total` (novo Counter Prometheus, `src/lib/ai/metrics.ts`)
incrementado a cada bloqueio real — antes só existia o gauge estático `ai_usage_budget_usd_total`
(valor de referência, nunca soube se algo de fato foi bloqueado).

**Fora de escopo (documentado, não construído)**: orçamento por organização (ver risco acima);
gating de `generateEmbedding()` — os embeddings usam o provedor local por padrão (sem custo, nunca
registrado em `AILog`/`estimateCostUsd`) e o caminho remoto (`EMBEDDINGS_PROVIDER=gateway`) já não
tinha nenhum registro de custo antes desta correção, então não há dado real para o circuit breaker
usar ali sem construir contabilização nova.

Testes: `tests/unit/lib/ai/budget.test.ts` (10 casos — sem teto configurado nunca bloqueia; abaixo/
no/acima do teto; custo nulo tratado como zero; cache evita recomputar; reset de cache força novo
cálculo; Postgres indisponível não bloqueia; Redis indisponível cai para cálculo direto; roda com
bypass de RLS), `src/lib/ai/__tests__/gateway.test.ts` (1 caso novo — `getAiModel().invoke()` não
contata nenhum provedor se o orçamento já foi excedido),
`src/features/intelligence/agents/__tests__/base.agent.budget.test.ts` (1 caso novo — mesma garantia
para `runWithTools()`/BDR), `tests/integration/ai-budget.test.ts` (6 casos, Postgres real — soma
GLOBAL cross-tenant confirmada com 2 organizações reais, bypass de RLS confirmado contra a policy
real da tabela, bloqueio/não-bloqueio pelo teto, cache).

## AI-003 — persistência honesta de AgentMemory (onda 31)

**Estado de entrada**: 5 caminhos de escrita em `AgentMemory` (`BaseAgent.updateMemory`,
`SDRQualificationAgent.updateMemory`, `OpsAgent.updateMemory`, `LearningAgent.persistProfile`,
`AgentService.saveMemory`), todos fazendo `findFirst` por `sessionId`+`organizationId` (sem
`agentType`) seguido de `create`/`update` condicional — não atômico, uma corrida real (duas
chamadas concorrentes podiam ambas ver "não existe" e ambas criar uma linha). 4 dos 5 engoliam
qualquer erro num try/catch-log-e-segue; o quinto (`AgentService.saveMemory`, usado pelo worker
BullMQ do SDR Outbound) fazia só `create()` sem try/catch, mas SEMPRE criava uma linha nova por
turno (nenhuma constraint impedia isso, e `loadMemory()` só lia a mais recente — as anteriores só
ocupavam espaço). Sem nenhuma unique constraint na tabela. `GET /agents/sdr/status/:sessionId`
(único consumidor real do progresso de uma execução assíncrona) tinha um contrato binário —
"existe linha" = completed, "não existe" = pending — então qualquer falha anterior à persistência
(bloqueio de guardrail LGPD, erro no grafo LangGraph, a própria escrita falhando) deixava a sessão
presa em `pending` para sempre, indistinguível de "ainda rodando".

**Construído**:
- Migration `20260820100000_agent_memory_status_and_unique` (escrita à mão, mesma limitação de
  shadow database das ondas anteriores — aplicada e validada contra Postgres real): colapsa
  duplicatas existentes (por `organizationId` não nulo — linhas legadas sem tenant ficam de fora,
  mesmo tratamento que o resto do schema já dá a elas), adiciona `status`
  (`AgentMemoryStatus`: `Completed`/`Failed`), `errorMessage` (truncado em 500 caracteres) e
  `updatedAt`, e cria a unique constraint `(sessionId, agentType, organizationId)`.
- `src/features/intelligence/agents/agentMemory.store.ts` (novo) — ponto único de escrita/leitura,
  substituindo a lógica duplicada nos 5 arquivos. `saveAgentMemory()` faz `upsert` atômico
  (`INSERT ... ON CONFLICT DO UPDATE`) quando `organizationId` está presente — que é sempre, em
  operação normal — e cai para o padrão anterior (findFirst+create/update) só no caso residual sem
  tenant (o Prisma nem aceita `null` na chave composta tipada; a constraint do Postgres também não
  protegeria esse caso, já que NULL nunca colide com outro NULL num índice único). Nunca engole
  erro — quem chama decide.
- Todos os 5 caminhos de escrita migrados para `saveAgentMemory`. Onde antes uma falha era só
  logada e a execução seguia como se tivesse funcionado, agora: (a) o resultado reportado ao
  caller direto de `run()` vira `{success:false, error}` honesto em vez de `{success:true}` com a
  memória nunca persistida; (b) `SDRQualificationAgent`/`OpsAgent` chamam o novo
  `recordAgentFailure()` (grava `status:'Failed'`+motivo) nos dois pontos onde antes nenhuma linha
  era gravada — bloqueio de consentimento LGPD e erro no grafo LangGraph.
- `GET /agents/sdr/status/:sessionId`: 3 estados agora — `pending` (sem registro), `completed`
  (`status:'Completed'`, devolve `messages`), `failed` (`status:'Failed'`, devolve `error`).
  `docs/openapi.yaml` corrigido para descrever o formato real (não seguia `DataEnvelope`, e nunca
  devolvia `404` como o contrato antigo documentava).
- `AgentService.saveMemory` (usado pelo SDR Outbound via worker BullMQ) passou de "sempre cria uma
  linha nova" para o mesmo upsert-em-lugar — fecha o crescimento ilimitado de linhas por sessão
  (nenhuma delas era lida de volta, `loadMemory()` sempre pegava só a mais recente) sem mudar
  nenhum comportamento observável.

**Fora de escopo (documentado, não construído)**: orçamento/memória por tenant não é afetado por
este item; linhas legadas com `organizationId` nulo continuam fora da proteção da unique constraint
(nenhum caminho de escrita vivo hoje deveria gerar uma nova).

Testes: `src/features/intelligence/agents/__tests__/agentMemory.store.test.ts` (12 casos, prisma
mockado — upsert vs. fallback sem tenant, truncamento de erro, status padrão, propagação de erro,
`recordAgentFailure` nunca lança), `ops.agent.consent.test.ts` (mock de prisma atualizado para
incluir `upsert`), `tests/integration/agent-memory.test.ts` (9 casos, Postgres real — 10 escritas
concorrentes para a mesma sessão nunca duplicam a linha, upsert sobrescreve estado anterior
(failed→completed), truncamento real, os 3 estados da rota de status ponta a ponta via supertest,
RLS cross-organização).

## Gate final (onda 31)
- typecheck: `npx tsc --noEmit` — limpo
- lint: `npm run lint` — 0 erros, 89 warnings (baseline herdado, nenhum novo)
- unit: **191/191 arquivos, 1483/1483 testes**
- integration (Postgres+Redis reais): **43/43 arquivos, 218/218 testes**
- build e build:worker — ambos limpos

## AI-002 — checkpointer real de LangGraph (onda 32)

**Estado de entrada**: `MemorySaver` (RAM) nos 3 grafos com checkpointer (`sdrQualification.agent.ts`,
`ops.agent.ts`, `supervisor.agent.ts`) — cada um um singleton de módulo. Uma correção anterior
(onda 20) já tinha prefixado `thread_id` por `${organizationId}:${sessionId}`, fechando a colisão
de checkpoint entre organizações, mas não a perda de estado a cada restart/deploy do processo.

**Construído**: `src/lib/ai/checkpointer.ts` (novo) — `PostgresSaver`
(`@langchain/langgraph-checkpoint-postgres`, dependência nova) sobre um `pg.Pool` dedicado (não o
pool interno, não exportado, de `prisma.ts` — vidas úteis diferentes, `PostgresSaver.end()` fecha
seu próprio pool). `ensureCheckpointerReady()` chama `checkpointer.setup()` (migration própria do
pacote, cria `checkpoints`/`checkpoint_writes`/`checkpoint_blobs`/`checkpoint_migrations` no schema
`public`) de forma memoizada e preguiçosa — chamado dentro de cada `run()`/`executeMission()`, não
no boot do processo, porque há dois processos de entrada distintos (`server.ts` e `worker.ts`) e
inicialização preguiçosa evita depender de conectar isso às duas sequências de boot.

Schema `public` (não um schema dedicado). **Achado real, pego pelo CI** (não pelo gate local, que
inicialmente mascarou o problema por acidente de bootstrap manual — ver `.agents/runs/onda-32.md`):
`PostgresSaver.setup()` roda `CREATE SCHEMA IF NOT EXISTS "public"` incondicionalmente, mesmo usando
o schema padrão já existente, e o Postgres checa a permissão de `CREATE SCHEMA` (nível de BANCO) ANTES
de checar se o schema já existe — ser dono do schema `public` (como `prospector_app` já era, para as
migrations do Prisma funcionarem) NÃO é suficiente. `scripts/db/create-app-role.sql` corrigido com
`GRANT CREATE ON DATABASE ... TO prospector_app`. **Ação pendente antes do primeiro deploy desta
correção**: o mesmo GRANT precisa ser aplicado manualmente no Postgres de produção (Supabase) — o
script de bootstrap não roda automaticamente contra produção. Tabelas do pacote não colidem com
nenhum model do `schema.prisma` (nomes conferidos).

**Sem RLS nas tabelas do checkpointer** — o pacote fala SQL cru direto no `pg.Pool`, nunca passa
pela extensão RLS-aware do Prisma (`app.current_tenant_id`). Isolamento de tenant é só o prefixo de
`thread_id`, já em vigor desde a onda 20. Mesmo modelo de confiança já aceito neste repo para
BullMQ/Redis (`src/lib/queue/agent.worker.ts`: fila também não tem RLS-equivalente, depende de cada
job carregar `tenantId` explícito no payload) — documentado como risco aceito, não uma omissão.

**Sem política de TTL** — o pacote expõe `deleteThread(threadId)`, mas decidir a política de
retenção (quanto tempo um checkpoint de missão pausada/concluída deveria continuar consultável) é
decisão de produto própria, fora do escopo desta correção pontual.

Testes: `tests/unit/lib/ai/checkpointer.test.ts` (5 casos, pg/PostgresSaver mockados — memoização de
`setup()`, retry após falha, `closeCheckpointerPool`), `tests/integration/langgraph-checkpointer.test.ts`
(3 casos, Postgres real — `setup()` idempotente; estado gravado por uma instância de `PostgresSaver`
é lido de volta por uma instância independente com seu próprio `pg.Pool`, provando persistência real
entre "processos" sem depender de matar o processo de teste; threads diferentes não colidem).
`ops.agent.consent.test.ts` atualizado para mockar `checkpointer.js` (o caso "sem leadId" invoca o
grafo de verdade, e sem o mock tentaria abrir uma conexão Postgres real num teste unitário).

## Gate final (onda 32)
- typecheck: `npx tsc --noEmit` — limpo
- lint: `npm run lint` — 0 erros, 89 warnings (baseline herdado, nenhum novo)
- unit: **192/192 arquivos, 1488/1488 testes**
- integration (Postgres+Redis reais): **44/44 arquivos, 221/221 testes**
- build e build:worker — ambos limpos

## AI-007 (parte 2) — gate de consentimento no enxame (onda 33)

**Estado de entrada**: `AIService.qualifyLead`/SDR/Ops já tinham o gate fail-closed
`assertPiiExternalConsent` (`guardrails.service.ts`) desde a onda 7/20, mas os 3 agentes que
estendem `BaseAgent` (`BDRAgent`, `CloserAgent`, `CRMAgent`) — acionados pelo scheduler autônomo
24/7 (`swarmScheduler.service.ts` → `autonomyRoleRunner.service.ts`) e por missão manual no
`SwarmDashboard.tsx` (`POST /swarm/mission`, roteada pelo supervisor do enxame) — enviavam texto
livre de missão a Groq/OpenAI sem checagem alguma de base legal.

**Decisão de design**: gate incondicional (não depende de `leadId` estar presente), diferente do
Ops Agent (que só verifica quando um `leadId` real está em jogo, já que sem ele nunca busca um
Contact estruturado). BDR/Closer/CRM recebem texto livre — digitado por um operador humano no
dashboard, ou montado por `buildMission()` a partir de dados do Lead no scheduler — sem nenhum
sinal estrutural confiável para decidir "este texto não tem PII de um titular real". Fail-closed
incondicional é a escolha conservadora consistente com o resto do gate (`hasPiiExternalConsent`:
"nenhuma organização passa até aparecer explicitamente na lista").

**Construído**: gate adicionado em `base.agent.ts`, no ÚNICO lugar comum às 3 subclasses — não em
cada agente individualmente, fechando o blast radius identificado na auditoria original (onda 20):
- `BaseAgent.run()` (caminho usado por `CRMAgent`, StateGraph de turno único): checa
  `assertPiiExternalConsent(organizationId)` antes de montar o grafo.
- `BaseAgent.runWithTools()` (caminho usado por `BDRAgent`/`CloserAgent`, loop ReAct via
  `createReactAgent`): mesma checagem, antes até do `assertAiBudgetNotExceeded()` do AI-011 (que já
  existia neste método).
- Em ambos, bloqueio grava a falha em `AgentMemory` (`recordAgentFailure`, status `Failed`) — mesmo
  padrão de auditoria já usado por SDR/Ops desde o AI-003, mesmo BDR/Closer/CRM não tendo uma rota
  HTTP de polling de status própria: o histórico de bloqueios fica consultável para evidência LGPD.

**Fora de escopo (documentado como risco aceito, não omissão)**: minimização de PII (token
reversível, como `minimizePii`/`rehydratePii` já fazem para o nome do contato no SDR) — quando uma
organização TEM consentimento registrado, o texto livre da missão ainda não passa por nenhuma
pseudonimização antes de sair. Diferente do SDR (Contact estruturado, sabe exatamente qual string é
o nome do titular), BDR/Closer/CRM recebem texto sem campos estruturados — identificar com
segurança o que é PII nesse texto exigiria um passo de NER/heurística próprio, feature nova fora do
escopo desta correção pontual. Ver tabela de riscos acima.

Testes: `src/features/intelligence/agents/__tests__/base.agent.consent.test.ts` (4 casos novos —
BDR bloqueado via `runWithTools` sem montar modelo, CRM bloqueado via `run` sem montar modelo, sem
`organizationId` no contexto também bloqueia, falha registrada em `AgentMemory`).
`base.agent.budget.test.ts` (AI-011) ajustado: precisa rodar dentro de um `requestContext` com
organização consentida, senão o novo gate de consentimento intercepta antes do circuit breaker de
orçamento que aquele teste existe para provar.

## Gate final (onda 33)
- typecheck: `npx tsc --noEmit` — limpo
- lint: `npm run lint` — 0 erros, 89 warnings (mesmo baseline da onda 32, nenhum novo)
- unit: `npx vitest run -c vitest.unit.config.ts` — **193/193 arquivos, 1492/1492 testes**
- integration (Postgres+Redis reais): `npx dotenv-cli -e .env.test -- npx vitest run -c vitest.integration.config.ts`
  — **44/44 arquivos, 221/221 testes** (`swarm-autonomous-mission-e2e.test.ts` exercita o `CRMAgent`
  real, ponta a ponta, através do novo gate — já rodava com consentimento liberado para a
  organização de teste)
- build e build:worker — ambos limpos

## AI-010 — citação real e rastreável no Copiloto Técnico (onda 34)

**Estado de entrada**: `POST /api/intelligence/suite/knowledge/copilot` (`ai-suite.routes.ts`)
confiava em `retrievedDocumentSnippets: string[]` enviado pelo CLIENTE — qualquer texto virava
"documento" para o prompt, e o LLM escrevia livremente `sourceReferences: string[]` (ex.: `"Manual
do Módulo Atlas v2.4"`) sem nenhuma relação verificável com um `Document`/`DocumentChunk` real. O
retrieval real (`searchService.hybridSearch`, pgvector + full-text + RRF, já usado por
`POST /api/knowledge/search` e por `VectorSearchService`/`vectorStore` do enxame de IA) nunca era
chamado por este endpoint — cada `SearchHit` já carregava `documentId`/`chunkId`/`documentTitle`/
`score` reais, mas nada os conectava à resposta final do copiloto.

**Construído**:
- `ai-suite.routes.ts`: `/knowledge/copilot` ganhou validação Zod (`{question, userRole?}` — o
  cliente não fornece mais snippets) e passou a chamar `searchService.hybridSearch(organizationId,
  question)` no servidor, com `organizationId` vindo sempre de `req.user` (nunca do body).
- `knowledge-copilot.service.ts`: `CopilotQueryInput.hits: SearchHit[]` substitui
  `retrievedDocumentSnippets`. O prompt lista os trechos NUMERADOS (`[1] ...`, `[2] ...`); o LLM é
  instruído a nunca escrever o nome de uma fonte, só o ÍNDICE do trecho em `citedSnippetIndexes:
  number[]` (contrato bruto interno, `RawCopilotResponse`). `resolveCitations` resolve cada índice
  de volta para o `SearchHit` real correspondente — um índice fora de faixa, não-inteiro, ou
  duplicado é descartado silenciosamente (alucinação de citação, não erro fatal). O contrato
  público `CopilotAnswerOutput.sourceReferences` mudou de `string[]` para `CopilotCitation[]`
  (`documentId`/`chunkId`/`documentTitle`/`chunkIndex`/`score`) — a citação final é sempre um
  subconjunto verificável dos hits reais, nunca texto livre do LLM.
- Sem hits (nada encontrado na base), o prompt diz isso explicitamente ("Nenhum documento da base
  de conhecimento foi encontrado para esta pergunta"), mesmo padrão de honestidade já usado no
  fallback de erro do serviço.
- `AISuiteHub.tsx` (playground interno de QA): `samplePayload` do capability #15 atualizado —
  não envia mais `retrievedDocumentSnippets` fabricado.

**Fora de escopo (documentado como risco aceito)**: proveniência da CITAÇÃO está resolvida, mas o
resto da resposta (`directAnswer`/`technicalSpecifications`) continua sendo texto livre do LLM sem
verificação de que cada afirmação está de fato sustentada pelo(s) trecho(s) citado(s) — grounding
real de factualidade é o mesmo problema que AI-006 já mapeia como métrica de avaliação ainda não
construída (depende do harness de AI-005/AI-006). Ver tabela de riscos acima.

Testes:
- `src/features/knowledge/services/__tests__/knowledge-copilot.service.test.ts` (novo, 8 casos) —
  resolução de índice válido, índice fora de faixa descartado, índices não-inteiros/negativos
  descartados, deduplicação, `citedSnippetIndexes` ausente/inválido não quebra, honestidade sem
  hits, múltiplos hits citam só o índice referenciado, fallback de erro sem citação inventada.
- `tests/unit/features/intelligence/routes/ai-suite.knowledge-copilot.routes.test.ts` (novo, 3
  casos) — `hybridSearch` chamado com a organização do usuário autenticado (nunca de
  querystring/body), `retrievedDocumentSnippets` do contrato antigo é ignorado silenciosamente,
  pergunta curta demais devolve 400 sem chamar busca nem LLM.
- `tests/integration/knowledge-copilot-citation.test.ts` (novo, 2 casos, Postgres/pgvector reais)
  — a prova mais forte: ingere um documento real, roda `hybridSearch` de verdade, e confirma que a
  citação devolvida aponta para o `documentId`/`chunkId` exatos do documento realmente ingerido
  (um índice alucinado adicional pelo LLM-stub é descartado); busca de outro tenant nunca traz o
  documento do tenant A como hit, e por isso nunca vira citação (isolamento de tenant também na
  citação, não só na busca).
- `CentralAISuiteService.test.ts` (existente) atualizado: mock do LLM devolve
  `citedSnippetIndexes: [1]` (era `sourceReferences: ['Manual Técnico']`); caso #15 passa um `hits`
  real e confirma a citação resolvida.

## Gate final (onda 34)
- typecheck: `npx tsc --noEmit` — limpo
- lint: `npm run lint` — 0 erros, 89 warnings (mesmo baseline da onda 33, nenhum novo)
- unit: `npx vitest run -c vitest.unit.config.ts` — **195/195 arquivos, 1503/1503 testes**
- integration (Postgres+Redis reais): `npx dotenv-cli -e .env.test -- npx vitest run -c vitest.integration.config.ts`
  — **45/45 arquivos, 223/223 testes**
- build e build:worker — ambos limpos
