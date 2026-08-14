import client from 'prom-client';

/**
 * Falhas de sincronização com o Bitrix24 — tanto o push automático/manual (Atlas → Bitrix, ver
 * `logSync` em outboundSync.ts) quanto o pull automático por regra (Bitrix → Atlas, ver
 * `runBitrixSyncTick` em syncRules.ts e o worker em `src/lib/queue/bitrixSync.worker.ts`).
 *
 * Sem isto, uma sincronização podia falhar repetidamente sem nenhum sinal agregado e acionável —
 * só logs individuais ou o painel /admin/queues job a job (bloqueador #11 de `/AGENTS.md`,
 * handoff `.agents/handoffs/onda-4/10-para-06-metricas-sync-bitrix.md`). Consumida pela regra
 * `BitrixSyncFailuresHigh` em `infrastructure/observability/alert.rules.yml`, exposta via
 * `GET /metrics` quando `EXPOSE_METRICS=true` (ver server.ts).
 *
 * `tenant`: organizationId da falha (ou "unknown" quando o ponto de falha não tem contexto de
 * organização — ex.: o tick inteiro do worker rejeitando antes de resolver quais organizações
 * processar). `entity`: tipo de registro envolvido (lead/deal) ou "tick" para uma falha do
 * agendamento como um todo, não de uma regra/lead específico.
 *
 * Guard contra "A metric with the name X has already been registered": este módulo pode ser
 * importado por mais de um consumidor (outboundSync.ts, syncRules.ts, bitrixSync.worker.ts) e, em
 * testes (vitest com isolamento por arquivo), o Registry padrão do prom-client pode acabar vendo
 * mais de uma tentativa de registro dentro do mesmo processo — reaproveita a métrica existente em
 * vez de lançar.
 */
export const bitrixSyncFailuresTotal =
    (client.register.getSingleMetric('bitrix_sync_failures_total') as client.Counter<'tenant' | 'entity'> | undefined) ??
    new client.Counter({
        name: 'bitrix_sync_failures_total',
        help: 'Total de falhas de sincronização com o Bitrix24 (push ou pull), por organização (tenant) e tipo de entidade.',
        labelNames: ['tenant', 'entity'] as const,
    });
