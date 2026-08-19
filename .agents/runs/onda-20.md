# Onda 20 — Sprint 07: IA, enxame, guardrails e evaluation

## Identificação
- Sprint: 07 (roadmap `SPRINT-07-IA-ENXAME-EVALUATION.md`; o próprio arquivo do roadmap se
  autodenomina "Onda 19", mas esse número já estava em uso neste repo pelo CYC-008/runtime de
  cadência — este relatório usa onda-20 para não colidir com `.agents/runs/onda-19.md`)
- SHA de entrada: `1b8f977` (main, após merge do PR #167/onda-19)
- Branch de integração: `claude/sprint-07-ia-enxame-evaluation`
- Status: **APROVADA COM RESSALVA** — 6 dos 11 itens corrigidos ou fechados nesta rodada
  (AI-001, AI-004, AI-008, AI-009 completos; AI-002 e AI-007 parciais), 5 documentados como
  pendência real (construção de feature ou decisão de produto)

## Contexto

Roadmap de 11 entregas (AI-001 a AI-011) sobre governança de IA: nomenclatura, persistência de
estado de agente, guardrails de execução autônoma, evaluation harness, base legal LGPD,
classificação de ferramentas por impacto, SLO, proveniência de RAG e budget/circuit breaker.
Auditoria real (5 investigações paralelas independentes, cada uma lendo código-fonte direto) contra
os 11 itens antes de qualquer correção — mesmo padrão das sprints anteriores desta série.

## Matriz de propriedade da auditoria

| Agente | Escopo | Resultado |
|---|---|---|
| Auditoria 1 | AI-001 (nomes SDR) + AI-008 (classificação de tools) | Rename mecânico + achado já resolvido na onda 7 |
| Auditoria 2 | AI-002 (checkpointer) + AI-003 (AgentMemory) | Dois gaps reais confirmados |
| Auditoria 3 | AI-004 (structured output) + AI-007 (base legal PII) | Bug ativo de segurança + gap de consentimento |
| Auditoria 4 | AI-005 (golden dataset) + AI-006 (métricas) | Ambos ausentes/incompletos |
| Auditoria 5 | AI-009 (SLO) + AI-010 (RAG) + AI-011 (budget) | SLO quase pronto (rota faltando); RAG com citação alucinada; budget sem corte real |

Detalhe completo por item em [`docs/AI-SWARM-GOVERNANCE-AUDIT.md`](../../docs/AI-SWARM-GOVERNANCE-AUDIT.md).

## Achados corrigidos nesta rodada

### AI-004 — Bug ativo de segurança (o mais grave desta sprint)

`SDROutboundDraftAgent.draftEmailForLead` podia enviar e-mail real de forma totalmente autônoma
usando um fallback de texto que **nunca passou por validação de schema** — exatamente o bypass que
o roadmap proíbe. Corrigido: `isStructuredOutputValid` rastreado e persistido; `autoExecute` só
prossegue com schema validado, fail-closed inclusive para ações já existentes sem o campo (criadas
antes desta correção). 3 testes novos.

### AI-002 (parcial) — Colisão de checkpoint entre organizações

`thread_id` do LangGraph não era qualificado por tenant nos 3 grafos com `MemorySaver` singleton de
módulo — `sessionId` client-controlado nas rotas do enxame (`/swarm/mission`, `/swarm/stream`)
podia reaproveitar checkpoint em RAM de outra organização. Corrigido: `thread_id` agora
`${organizationId}:${sessionId}`. Checkpointer persistente (Postgres) continua pendente —
documentado, não é correção pontual.

### AI-007 (parcial) — Gap de consentimento no fluxo de maior volume

`AIService.qualifyLead` (worker `createLeadsWorker`, caminho padrão de TODO lead) enviava PII a
Groq/OpenAI sem checagem de base legal LGPD — diferente de SDR Outbound/SDR Autônomo/Ops Agent, que
já tinham a trava desde a onda 7. Corrigido no ponto de maior volume. Agentes BDR/Closer/CRM do
enxame continuam sem gate — documentado como pendência com blast radius maior.

### AI-009 — Rota de SLO nunca registrada

Confirmado por duas auditorias independentes: fonte de dados e UI prontas desde a onda 7
(handoff aberto `.agents/handoffs/onda-7/13-para-07-rota-slo-swarm.md`), só faltava a rota HTTP.
Registrada exatamente como o handoff especificava. 4 testes novos.

### AI-001 — Rename mecânico

`sdr-agent.ts`→`sdrOutboundDraft.agent.ts`, `sdr.agent.ts`→`sdrQualification.agent.ts`. Blast
radius totalmente mapeado pela auditoria antes do rename (3 imports de código real, 2 testes, 2
docs vivas) — zero comportamento alterado, só nome de arquivo.

### AI-008 — Já resolvido; doc desatualizada corrigida

Classificação por impacto das 9 tools já fechada na onda 7. Só a contagem em
`.agents/completion/02-mapa-plataforma.md` estava errada (8 vs 9) — corrigida com a tabela completa.

## Achados documentados como pendência (construção de feature ou decisão de produto)

Resumo em `docs/AI-SWARM-GOVERNANCE-AUDIT.md`; motivo do não-tratamento em cada caso:

| Item | Situação real | Por que não construído nesta sprint |
|---|---|---|
| AI-002 (checkpointer persistente) | `MemorySaver` continua em RAM, sem recovery de restart | Dependência nova + política de TTL é feature nova |
| AI-003 (memória honesta) | 4/5 escritas em `AgentMemory` engolem erro; polling trata ausência como "pendente para sempre" | Exige migration (unique constraint) + redesenho de contrato de API |
| AI-005 (Golden Dataset) | Não existe | Construção de feature nova completa |
| AI-006 (métricas de avaliação) | Só 3/9 dimensões capturadas | Depende de AI-005 para a maioria |
| AI-007 (BDR/Closer/CRM) | Enxame autônomo sem gate de consentimento | Blast radius maior + decisão de produto sobre política do enxame |
| AI-010 (RAG com proveniência) | `/knowledge/copilot` cita fonte inventada pelo LLM, não rastreável | Wiring de retrieval real + mudança de contrato de resposta |
| AI-011 (budget/circuit breaker) | Sem corte automático por custo | Decisão de produto sobre o que "cortar" significa |

## Gate final
- typecheck: `npx tsc --noEmit` — limpo, 0 erros
- lint: `npm run lint` — 0 erros, 82 warnings (mesmo nível da onda anterior)
- unit: `npx vitest run -c vitest.unit.config.ts` — **169/169 arquivos, 1313/1313 testes** (era
  167/1303 antes desta sprint — +2 arquivos novos + testes adicionados a `sdrOutboundDraft.agent.test.ts`)
- integration: `npx dotenv-cli -e .env.test -- npx vitest run -c vitest.integration.config.ts`
  (Postgres + Redis reais) — **33/33 arquivos, 140/140 testes**
- build: `npm run build` e `npm run build:worker` — ambos limpos
- `npm run verify:ai`: não é gate bloqueante hoje (smoke test, `continue-on-error: true` no CI já
  antes desta sprint) — ver AI-005 para o porquê
- e2e: não executado nesta rodada (nenhuma mudança de UI)

## Skips e flakes
0 — nenhum teste pulado ou instável observado nesta rodada.

## Riscos restantes
| Risco | Dono | Motivo do aceite | Revisar em |
|---|---|---|---|
| `followUp.worker.ts` pode estar processando sempre 0 leads em produção (mesma classe de bug de RLS sem contexto corrigida no worker de cadência, onda 19) | 16 | Não investigado nesta rodada — outro worker | Próxima rodada de follow-up/cadência, prioridade alta |
| BDR/Closer/CRM do enxame sem gate de consentimento LGPD | 13 + 01A | Blast radius + decisão de produto | Sprint dedicada a AI-007 |
| `AgentMemory` pode duplicar sob concorrência; falha de escrita invisível | 07 | Exige migration | Quando AI-003 for priorizada |
| Citação de fonte em RAG copilot é alucinada, não rastreável | 07 | Wiring + mudança de contrato | Quando AI-010 for priorizada |
| Sem teto de custo real por tenant | 13 | Decisão de produto | Quando AI-011 for priorizada |

## Decisão

**APROVADA COM RESSALVA**: o achado mais grave da auditoria (AI-004 — bug ativo permitindo envio
autônomo de e-mail a partir de texto nunca validado por schema) foi corrigido e testado, junto com
um segundo problema de segurança real (AI-002, colisão de checkpoint entre tenants) e um gap de
compliance no caminho de maior volume (AI-007). AI-008 e AI-009 fecham lacunas de trabalho já feito
em ondas anteriores que nunca chegou a produção (classificação de tools documentada, rota de SLO
nunca registrada). AI-001 é rename mecânico de baixo risco com blast radius totalmente mapeado.

Os 5 itens restantes (AI-003, AI-005, AI-006, AI-010, AI-011, e a parte de AI-002/AI-007 não
fechada nesta rodada) exigem construção de feature nova ou decisão de produto que não cabe numa
correção pontual dentro desta rodada de auditoria — cada um está documentado com o estado real e o
motivo específico do adiamento em `docs/AI-SWARM-GOVERNANCE-AUDIT.md`.
