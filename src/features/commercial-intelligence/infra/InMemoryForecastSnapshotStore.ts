/**
 * Implementação em memória de `ForecastSnapshotStore` — PROTÓTIPO, não persistência real.
 *
 * O snapshot semanal do forecast (`application/forecastSnapshot.ts`) precisa sobreviver a
 * reinícios de processo para servir de base ao "erro histórico do forecast"
 * (`application/forecastAccuracy.ts`) semanas/meses depois de ter sido tirado — isso exige uma
 * tabela nova em `prisma/schema.prisma` (ex.: `ForecastSnapshot`), que é propriedade exclusiva do
 * Agente 01/01A (ver `/AGENTS.md` → "Propriedade exclusiva de arquivos" e
 * `src/features/commercial-intelligence/AGENTS.md` → "Não pode: criar migration sem handoff").
 *
 * Esta classe existe só para:
 * 1. deixar a lógica de cálculo (`buildForecastSnapshot`/`computeForecastAccuracy`/
 *    `summarizeForecastAccuracy`) testável hoje, sem banco;
 * 2. documentar o contrato exato (`ForecastSnapshotStore`) que a implementação real (Prisma)
 *    precisa satisfazer quando a tabela existir.
 *
 * NÃO usar em produção — os dados somem a cada reinício do processo. Handoff aberto:
 * `.agents/handoffs/onda-39/04-para-01-schema-forecast-snapshot.md`.
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
