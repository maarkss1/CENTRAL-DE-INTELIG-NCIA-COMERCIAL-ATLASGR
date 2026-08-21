# Onda 33 — AI-007 (parte 2): gate de consentimento LGPD no enxame (BDR/Closer/CRM)

## Contexto

Item 13/15 da rodada "resolver todas as pendências" (`docs/AI-SWARM-GOVERNANCE-AUDIT.md`, Sprint
07). Segue o merge de AI-002 (PR #207).

**Estado de entrada (auditoria, onda 20)**: `AIService.qualifyLead`/SDR Autônomo/Ops Agent já
tinham o gate fail-closed `assertPiiExternalConsent` (`guardrails.service.ts`) desde a onda 7/20 —
mas os 3 agentes que estendem `BaseAgent` (`BDRAgent`, `CloserAgent`, `CRMAgent`), acionados pelo
scheduler autônomo 24/7 ou por missão manual no `SwarmDashboard.tsx`, enviavam o texto livre da
missão a Groq/OpenAI sem checagem alguma de base legal LGPD.

## Decisão de design

Gate **incondicional** em `base.agent.ts` (não em cada agente individualmente), sem pergunta de
produto em aberto — a auditoria original já apontava exatamente esse arquivo como o ponto certo
("blast radius maior: `base.agent.ts` compartilhado por 3 agentes"):

1. **Incondicional, diferente do Ops Agent.** Ops só verifica consentimento quando um `leadId`
   real está em jogo (sem ele, nunca busca um Contact estruturado — não há PII de titular). BDR/
   Closer/CRM recebem texto livre — digitado por um operador humano, ou montado por
   `buildMission()` a partir de dados do Lead no scheduler — sem nenhum sinal estrutural
   equivalente para decidir com segurança "este texto não tem PII". Fail-closed incondicional é a
   escolha conservadora, consistente com o resto do gate.
2. **No `base.agent.ts`, não nos 3 arquivos de agente.** `CRMAgent` usa `run()` (StateGraph de
   turno único); `BDRAgent`/`CloserAgent` usam `runWithTools()` (loop ReAct). Um único ponto por
   caminho de execução, reaproveitando exatamente o padrão já usado por SDR/Ops
   (`assertPiiExternalConsent` + `recordAgentFailure` no bloqueio).

## O que foi construído

- **`src/features/intelligence/agents/base.agent.ts`** — gate adicionado no topo de `run()` (antes
  de montar o `StateGraph`) e de `runWithTools()` (antes até do `assertAiBudgetNotExceeded()` do
  AI-011, que já existia ali): `assertPiiExternalConsent(organizationId)`; no bloqueio, loga um
  aviso, chama `recordAgentFailure` (grava `AgentMemory` com `status: 'Failed'` — mesmo padrão de
  auditoria já usado por SDR/Ops desde o AI-003, ainda que BDR/Closer/CRM não tenham uma rota HTTP
  de polling de status própria) e retorna `{error, sessionId}` honesto, sem tocar em nenhum modelo
  de IA.
- Testes: `src/features/intelligence/agents/__tests__/base.agent.consent.test.ts` (novo, 4 casos —
  BDR bloqueado via `runWithTools` sem montar nenhum modelo; CRM bloqueado via `run` sem montar
  nenhum modelo; sem `organizationId` no contexto também bloqueia; a falha fica registrada em
  `AgentMemory`).
- **`base.agent.budget.test.ts`** (AI-011) ajustado: como o novo gate de consentimento roda ANTES
  do circuit breaker de orçamento em `runWithTools()`, o teste original (sem `requestContext` nem
  organização consentida) passaria a bloquear no gate errado e nunca chegaria a exercitar o
  circuit breaker que ele existe para provar — corrigido rodando dentro de
  `requestContext.run({tenantId: ...})` com `AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS: '*'` mockado.

## Fora de escopo (documentado, não construído)

- **Minimização de PII** (token reversível, como `minimizePii`/`rehydratePii` já fazem para o nome
  do contato no SDR): quando uma organização TEM consentimento registrado, o texto livre da missão
  ainda não passa por nenhuma pseudonimização antes de sair para o provedor externo. Diferente do
  SDR (busca um Contact estruturado, sabe exatamente qual string é o nome do titular), BDR/Closer/
  CRM recebem texto sem campos estruturados — identificar com segurança o que é PII nesse texto
  exigiria um passo de NER/heurística próprio, feature nova. Documentado como risco aceito em
  `docs/AI-SWARM-GOVERNANCE-AUDIT.md` (tabela de riscos), não uma omissão silenciosa.

## Gate

- `npx tsc --noEmit` — limpo
- `npm run lint` — 0 erros, 89 warnings (mesmo baseline da onda 32, nenhum novo)
- unit: `npx vitest run -c vitest.unit.config.ts` — **193/193 arquivos, 1492/1492 testes** (4 casos
  novos em `base.agent.consent.test.ts`; `base.agent.budget.test.ts` ajustado)
- integration (Postgres+Redis reais): `npx dotenv-cli -e .env.test -- npx vitest run -c
  vitest.integration.config.ts` — **44/44 arquivos, 221/221 testes**, incluindo
  `swarm-autonomous-mission-e2e.test.ts`, que exercita o `CRMAgent` real ponta a ponta através do
  novo gate (já rodava com `AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS: '*'` para a organização de
  teste, sem precisar de ajuste)
- `npm run build` e `npm run build:worker` — ambos limpos

## Skips e flakes

0 — nenhum teste pulado ou instável observado nesta rodada.
