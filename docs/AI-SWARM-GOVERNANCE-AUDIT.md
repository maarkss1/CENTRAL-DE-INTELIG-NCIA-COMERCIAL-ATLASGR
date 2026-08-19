# Auditoria — IA, enxame, guardrails e evaluation (AI-001..011)

Sprint 07 / Onda 20. Auditoria real (5 investigações paralelas independentes, cada uma lendo o
código-fonte diretamente) do estado atual de cada entrega do roadmap
`SPRINT-07-IA-ENXAME-EVALUATION.md` contra o que existe implementado e conectado em produção.

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
| AI-011 Budget/circuit breaker | Não | Só teto de iterações (MAX_STEPS=5) e circuit breaker por provedor; nenhum corte por custo acumulado |

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
| AI-011 (budget/circuit breaker) | Sem corte automático por custo acumulado; `AI_MONTHLY_BUDGET_USD` só alimenta um alerta Prometheus passivo, nem declarado em `render.yaml` | Decisão de produto: o que "cortar" significa (rejeitar chamada? degradar para modelo menor? só notificar?) — não é algo para uma correção inventar sozinha |

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
| Sem teto de custo real por tenant/rota — só alerta passivo, possivelmente nem configurado em produção | 13 (enxame) | Decisão de produto sobre o que "cortar" significa | Quando AI-011 for priorizada |
