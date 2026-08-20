# Onda 35 — AI-006: harness real das 9 dimensões de avaliação

## Contexto

Item 15/15 da rodada "resolver todas as pendências" (`docs/AI-SWARM-GOVERNANCE-AUDIT.md`, Sprint
07). Segue o merge de AI-010 (PR #209). Pedido explicitamente pelo usuário para começar por AI-006
antes de AI-005 (que continua não construído — feature nova completa de curadoria de dataset, fora
do escopo desta correção pontual).

**Estado de entrada**: cost/latency (`AILog`) e human override (`AIPendingAction`, painel de SLO do
AI-009) já eram dados reais. As outras 6 dimensões (factualidade, aderência ao playbook, tool
correctness, hallucination, PII leakage rate, fallback rate) não tinham nada — nem um proxy.
`npm run verify:ai` é smoke test de conectividade (a chamada não lançou), sem comparação contra
referência nenhuma.

## Decisão de design

Sem AI-005, separei as 6 dimensões restantes em 3 baldes, cada um com o tratamento certo:

1. **Reaproveitável de graça**: `toolCorrectness` — proxy (1 − errorRate), reaproveitando o cálculo
   de `errorRate` que `getSwarmSloSnapshot` (AI-009) já faz por papel, agregado através dos papéis
   com ledger.
2. **Real, mas cobertura parcial documentada como tal**: `fallbackRate` — já era gravado
   (`AIPendingAction.payload.structuredOutputValid`, AI-004), mas só pelo SDR Outbound. Reportar
   "6/9 completo" sem dizer isso seria desonesto — o `note` da dimensão explica a cobertura real.
3. **Sinal novo, genuinamente ausente**: `piiLeakageRate` — nada registrava quando
   `redactSensitiveData` de fato mascarava um CPF numa resposta de IA. Tabela nova
   (`AIGuardrailEvent`) + wrapper (`redactAndTrackPiiLeak`) que os 4 pontos de chamada reais do
   guardrail agora usam.

As 3 dimensões que exigem uma resposta de referência para comparar (factualidade, aderência ao
playbook, hallucination) são reportadas como `{available: false, reason: '...AI-005...'}` — nunca
um número, nunca omitidas silenciosamente.

## O que foi construído

- `prisma/schema.prisma` + `prisma/migrations/20260820110000_ai_guardrail_event/`: model
  `AIGuardrailEvent` (`type`, `source`, `organizationId` sempre não-nulo). RLS simples (mesmo
  padrão de `Automation`/`Notification`) — os 4 pontos de chamada do guardrail sempre rodam atrás
  de `authenticateToken`+`requireTenant`, diferente de `AILog` (que também recebe escrita de
  worker/script sem tenant).
- `src/features/intelligence/services/guardrails.service.ts`: `redactAndTrackPiiLeak(text, source)`
  — mesmo `redactSensitiveData`, mas grava `AIGuardrailEvent` quando de fato houve redação;
  best-effort (falha ao gravar o evento não derruba a resposta). 4 call sites migrados:
  `ai.service.ts`, `studio/shared.ts`, `agent.routes.ts`, `CommercialIntelligenceAiService.ts`.
- `src/features/intelligence/services/evaluationMetrics.service.ts` (novo):
  `getEvaluationMetricsSnapshot(organizationId, windowDays)` — as 9 dimensões, reaproveitando
  `getSwarmSloSnapshot`/`emptyRate` (agora exportado de `swarmScheduler.service.ts`) em vez de
  duplicar a agregação de `AIPendingAction`/`AILog`.
- `GET /api/agent/evaluation-metrics` (novo, mesmo padrão de validação/organizationId de
  `/swarm/slo`).

## Fora de escopo (documentado, não construído)

- **Cobertura parcial de `fallbackRate`**: só SDR Outbound grava `structuredOutputValid`. Estender
  aos demais agentes é o mesmo trabalho de fechar AI-004 para eles — fora do escopo desta correção.
- **`toolCorrectness`/`piiLeakageRate` são proxies**, não a dimensão real: corretude semântica
  exige comparar contra uma ação esperada (AI-005); detecção de PII além de CPF é um detector novo.
- **Nenhuma UI nova**: só a API, mesma decisão de escopo do AI-011 (backend-only). Um dashboard
  consumindo `/evaluation-metrics` fica para quando isso for pedido explicitamente.

## Gate

- `npx tsc --noEmit` — limpo
- `npm run lint` — 0 erros, 89 warnings (mesmo baseline da onda 34, nenhum novo)
- unit: `npx vitest run -c vitest.unit.config.ts` — **197/197 arquivos, 1517/1517 testes** (4 casos
  novos em `guardrails.service.test.ts`, 6 casos novos em `evaluationMetrics.service.test.ts`, 4
  casos novos em `agent.routes.evaluation-metrics.test.ts`, `agent.routes.slo.test.ts` ajustado)
- integration (Postgres+Redis reais): `npx dotenv-cli -e .env.test -- npx vitest run -c
  vitest.integration.config.ts` — **46/46 arquivos, 226/226 testes**, incluindo
  `evaluation-metrics.test.ts` (novo, 3 casos) — `redactAndTrackPiiLeak` grava evento real; RLS
  real isola entre tenants (`FORCE ROW LEVEL SECURITY`, não um WHERE de aplicação);
  `getEvaluationMetricsSnapshot` end-to-end contra `AILog`/`AIGuardrailEvent` reais
- `prisma migrate diff` contra a migration nova: zero diff para `AIGuardrailEvent` (ruído
  pré-existente em outras tabelas, já documentado em ondas anteriores, fora de escopo)
- `npm run build` e `npm run build:worker` — ambos limpos

## Skips e flakes

0 — nenhum teste pulado ou instável observado nesta rodada. Nota operacional: Postgres/Redis locais
(usados pelo gate de integração) precisaram ser reiniciados no início desta onda — o container
tinha reiniciado entre ondas — sem impacto no resultado, só um passo manual antes de rodar o gate.
