- De: 13
- Para: 07
- Onda: 39
- Status: resolvido
- Prioridade: normal

## Problema

`src/features/intelligence/services/evaluationMetrics.service.ts:85` filtra `OPS` para fora do
agregado de `humanOverride`/`toolCorrectness`:

```ts
// Agrega humanOverride/toolCorrectness (proxy de errorRate) através dos papéis com ledger —
// OPS não tem AIPendingAction (executa direto), já vem como estado vazio de getSwarmSloSnapshot.
const ledgerAgents = sloSnapshot.agents.filter((agent) => agent.role !== 'OPS');
```

Isso deixou de ser verdade nesta onda (GOV-13): o `OpsAgent` agora propõe `create_follow_up`/
`notify_team` via `AIPendingAction` em vez de executar direto (ver
`src/features/intelligence/agents/opsPendingActions.tool.ts` e o comentário atualizado em
`swarmScheduler.service.ts:397-404`). `getSwarmSloSnapshot` já foi corrigido para não tratar OPS
como caso especial (testado em
`tests/unit/features/intelligence/services/swarmScheduler.sloSnapshot.test.ts`), mas este arquivo
(`evaluationMetrics.service.ts`) continua excluindo OPS do agregado de 9 dimensões — agora sem
motivo real, silenciosamente subestimando `humanOverride`/`toolCorrectness` quando OPS tiver volume.

## Arquivo(s) envolvido(s)

- `src/features/intelligence/services/evaluationMetrics.service.ts:83-97`
- `src/features/intelligence/services/__tests__/evaluationMetrics.service.test.ts` (se houver caso
  cobrindo esse filtro, precisa ser atualizado junto)

## Alteração necessária

Remover o filtro `agent.role !== 'OPS'` (ou trocar `ledgerAgents` por `sloSnapshot.agents` direto)
e atualizar o comentário para refletir que todos os 5 papéis agora usam o ledger igualmente.

## Teste esperado

Dado um `AIPendingAction` com `agentRole: 'OPS'` na janela, o agregado `humanOverride`/
`toolCorrectness` de `getEvaluationMetricsSnapshot` deve incluir essa linha (numerador/denominador
somados), não descartá-la.

## Contexto adicional

Não é meu arquivo (Agente 13 só edita `src/features/intelligence/agents/**` e os serviços que
consumi diretamente nesta onda) — `evaluationMetrics.service.ts` é do Agente 07 por `/AGENTS.md`.
