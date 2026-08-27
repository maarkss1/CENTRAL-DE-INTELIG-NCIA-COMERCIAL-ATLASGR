/**
 * Implementação em memória de `ForecastSnapshotStore` — PROTÓTIPO, não persistência real.
 *
 * A implementação real (Postgres, via `PrismaForecastSnapshotStore.ts`) já existe desde a
 * migration `20260827020000_forecast_snapshot` — o handoff
 * `.agents/handoffs/onda-39/04-para-01-schema-forecast-snapshot.md` que motivou esta classe está
 * resolvido. Esta classe continua existindo só para:
 * 1. deixar a lógica de cálculo (`buildForecastSnapshot`/`computeForecastAccuracy`/
 *    `summarizeForecastAccuracy`) testável em unidade, sem depender de Postgres real;
 * 2. servir de referência do contrato (`ForecastSnapshotStore`) para quem for escrever outro
 *    teste que precise de um fake em memória.
 *
 * NÃO usar em produção — os dados somem a cada reinício do processo; use
 * `PrismaForecastSnapshotStore` fora de teste.
 */
import type { ForecastSnapshotRecord, ForecastSnapshotStore } from '../domain/CommercialIntelligence';

export class InMemoryForecastSnapshotStore implements ForecastSnapshotStore {
    private records: ForecastSnapshotRecord[] = [];

    async save(record: ForecastSnapshotRecord): Promise<void> {
        // Append-only — nunca sobrescreve/atualiza um snapshot existente, mesmo mesmo id (não deveria
        // colidir: `randomUUID()` por chamada em `buildForecastSnapshot`).
        this.records.push(record);
    }

    async findByPeriod(organizationId: string, period: string): Promise<ForecastSnapshotRecord[]> {
        return this.records
            .filter((r) => r.organizationId === organizationId && r.period === period)
            .sort((a, b) => a.snapshotAt.localeCompare(b.snapshotAt));
    }

    async findAll(organizationId: string): Promise<ForecastSnapshotRecord[]> {
        return this.records
            .filter((r) => r.organizationId === organizationId)
            .sort((a, b) => a.snapshotAt.localeCompare(b.snapshotAt));
    }
}
