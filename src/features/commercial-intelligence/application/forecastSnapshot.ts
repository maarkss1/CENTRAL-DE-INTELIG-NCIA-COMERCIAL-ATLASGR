/**
 * Snapshot semanal do Forecast — registro append-only do que o motor previa em um instante, para
 * permitir depois comparar previsto-vs-realizado (`forecastAccuracy.ts`) e mostrar o erro histórico
 * do próprio motor. Puro e testável em isolamento: `buildForecastSnapshot` só lê campos já
 * calculados de `ExecutiveOverview` (nenhum cálculo novo aqui, mesmo espírito de
 * `predictiveForecast.ts`) e `randomUUID`/`now` são as únicas dependências externas, ambas
 * injetáveis.
 *
 * Persistência real (tabela dedicada em `prisma/schema.prisma`) depende de handoff para o Agente
 * 01 — ver `.agents/handoffs/` desta onda. Até lá, `infra/InMemoryForecastSnapshotStore.ts`
 * implementa a mesma porta (`ForecastSnapshotStore`) só para permitir testar a lógica de cálculo.
 */
import { randomUUID } from 'node:crypto';
import type { ExecutiveOverview, ForecastSnapshotRecord } from '../domain/CommercialIntelligence';
import { FORECAST_RULES_VERSION } from './forecastEngine';

/**
 * Constrói o registro de snapshot a partir de um `ExecutiveOverview` já calculado para o período.
 * Nunca escreve sozinho — quem chama decide quando persistir (`ForecastSnapshotStore.save`), o que
 * mantém esta função pura e testável sem I/O.
 */
export function buildForecastSnapshot(organizationId: string, overview: ExecutiveOverview, now: Date): ForecastSnapshotRecord {
    return {
        id: randomUUID(),
        organizationId,
        period: overview.period,
        snapshotAt: now.toISOString(),
        rulesVersion: FORECAST_RULES_VERSION,
        commitAmount: overview.commitAmount,
        bestCaseAmount: overview.bestCaseAmount,
        forecastAmount: overview.forecastAmount,
        currency: overview.goal?.currency ?? 'BRL',
    };
}
