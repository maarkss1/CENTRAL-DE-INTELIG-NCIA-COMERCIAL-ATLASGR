# Auditoria — IA, enxame, guardrails e evaluation (AI-001..011)

Sprint 07 / Onda 20. Auditoria real (5 investigações paralelas independentes, cada uma lendo o
código-fonte diretamente) do estado atual de cada entrega do roadmap
`SPRINT-07-IA-ENXAME-EVALUATION.md` contra o que existe implementado e conectado em produção.

**Onda 30 (rodada "resolver todas as pendências")**: AI-011 (budget/circuit breaker) construído —
ver seção "AI-011 — circuit breaker de orçamento mensal (onda 30)" abaixo. A tabela de "Resumo por
item" e a tabela de "Achados documentados como pendência" foram atualizadas para refletir isso; as
demais seções deste documento (AI-001..010) continuam descrevendo o estado da onda 20 original.

## Resumo por item

| Item | Corrigido nesta sprint | Estado real |
|---|---|---|
| AI-001 Nomes canônicos dos SDRs | Sim | `sdr-agent.ts`→`sdrOutboundDraft.agent.ts`, `sdr.agent.ts`→`sdrQualification.agent.ts` |
| AI-002 Checkpointer persistente | Parcial | `thread_id` agora qualificado por tenant (colisão cross-tenant fechada); checkpointer continua em RAM (`MemorySaver`), sem recovery de restart |
| AI-003 Persistência de memória honesta | Não | 4/5 caminhos de escrita em `AgentMemory` engolem erro e devolvem sucesso; sem unique constraint; polling trata "ausente" como "pendente para sempre" |
| AI-004 Structured output obrigatório | Sim | Fallback textual (nunca validado por Zod) não pode mais autoExecute |
| AI-005 Golden Dataset | Não | Não existe; `verify:ai` é smoke test de conectividade, não evaluation harness |
| AI-006 Métricas de avaliação | Não | Só 3/9 dimensões capturadas (cost, latency, human override); as demais 6 não têm nada |
| AI-007 Base legal/consentimento | Parcial | Gate adicionado ao fluxo padrão de qualificação (`AIService.qualifyLead`, maior volume); BDR/Closer/CRM do enxame continuam sem gate |
| AI-008 Classificação de ferramentas | Sim | Já estava correto (onda 7); contagem desatualizada na doc corrigida |
| AI-009 SLO por agente | Sim | Fonte de dados e UI já existiam (onda 7); rota HTTP nunca registrada — corrigido |
| AI-010 RAG com proveniência | Não | Metadados reais existem (documentId/chunkId/score); citação final ao usuário é inventada pelo LLM, não vem do retrieval real |
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
Teste: `ai.service.qualifyLead.test.ts` (3 casos). **Não corrigido**: os agentes BDR/Closer/CRM do
enxame (disparados pelo scheduler 24/7 ou por missão manual no `SwarmDashboard.tsx`) continuam sem
nenhum gate de consentimento nem minimização de PII — blast radius maior (`base.agent.ts` +
3 arquivos de agente), tratado como pendência, não uma correção pontual segura.

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
| AI-002 (checkpointer persistente) | `MemorySaver` continua em RAM; sem teste de restart/recovery | Adicionar `@langchain/langgraph-checkpoint-postgres` (dependência nova) + política de TTL é construção de feature nova, não correção pontual |
| AI-003 (persistência de memória) | 4/5 escritas em `AgentMemory` engolem erro; sem unique constraint; `GET /agents/sdr/status/:sessionId` trata ausência como "pendente para sempre" | Corrigir de verdade exige migration (unique constraint) + redesenho do contrato de status da rota de polling — mais que uma correção pontual |
| AI-005 (Golden Dataset) | Não existe nenhum dataset sanitizado/versionado para os 8 casos de uso pedidos | Construção de feature nova completa (curadoria de dataset + harness de avaliação) |
| AI-006 (métricas de avaliação) | Só cost/latency/human-override capturados; factualidade/aderência/tool-correctness/hallucination/PII-leakage-rate/fallback-rate não têm nada | Depende de AI-005 (dataset) para a maioria; construção de feature nova |
| AI-007 (consentimento — BDR/Closer/CRM) | Agentes do enxame (scheduler 24/7 + missão manual) sem gate de consentimento nem minimização de PII | Blast radius maior (`base.agent.ts` compartilhado por 3 agentes); decisão de produto sobre se o enxame autônomo deve ter o mesmo gate ou uma política própria |
| AI-010 (RAG com proveniência) | Metadados reais existem no schema/query; `/knowledge/copilot` nunca chama a busca real — cita fontes que o LLM inventa a partir do texto do prompt | Wiring do endpoint ao `hybridSearch` real + mudança de contrato de resposta (citação vem de metadado, não de texto livre do LLM) — moderado, mas não pontual |

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
| BDR/Closer/CRM do enxame enviam PII sem gate de consentimento nem minimização | 13 (enxame) + 01A (LGPD) | Blast radius maior + decisão de produto sobre política do enxame autônomo | Sprint dedicada a fechar AI-007 por completo |
| `AgentMemory` pode duplicar registro sob concorrência; falha de escrita é invisível ao usuário | 07 (IA/automações) | Exige migration + redesenho de contrato de API | Quando AI-003 for priorizada |
| Citação de fonte em `/knowledge/copilot` é inventada pelo LLM, não rastreável a um chunk real | 07 (IA) | Wiring de retrieval real + mudança de contrato de resposta | Quando AI-010 for priorizada |
| Orçamento de IA é GLOBAL (soma de todas as organizações), não por tenant — uma organização de alto consumo pode bloquear IA para todas as outras | 13 (enxame) | `AI_MONTHLY_BUDGET_USD` já era um único valor escalar antes do AI-011; orçamento por tenant exige coluna/tabela nova, fora do escopo da correção de onda 30 | Se algum tenant reclamar de bloqueio causado por outro tenant |

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
