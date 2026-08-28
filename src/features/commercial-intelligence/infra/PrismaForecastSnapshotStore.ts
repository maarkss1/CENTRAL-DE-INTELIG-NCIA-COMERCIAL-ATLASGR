/**
 * Implementação real (Prisma/Postgres) de `ForecastSnapshotStore` — o model `ForecastSnapshot`
 * existe desde a migration `20260827020000_forecast_snapshot` (ver
 * `.agents/handoffs/onda-39/04-para-01-schema-forecast-snapshot.md`, agora resolvido). Substitui
 * `InMemoryForecastSnapshotStore` (protótipo, dados somem a cada reinício) em produção.
 *
 * Append-only por design, igual ao protótipo: `save` sempre faz um `create`, nunca um upsert — a
 * tabela não tem UNIQUE por (organizationId, period) de propósito, para preservar o histórico de
 * revisões quando o snapshot semanal roda mais de uma vez no mesmo período.
 */
import type {
  ForecastSnapshotRecord,
  ForecastSnapshotStore,
} from '../domain/CommercialIntelligence';
import { prisma } from '../../../lib/prisma.js';

function toRecord(row: {
  id: string;
  organizationId: string;
  period: string;
  snapshotAt: Date;
  rulesVersion: string;
  commitAmount: { toString(): string };
  bestCaseAmount: { toString(): string };
  forecastAmount: { toString(): string };
  currency: string;
}): ForecastSnapshotRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    period: row.period,
    snapshotAt: row.snapshotAt.toISOString(),
    rulesVersion: row.rulesVersion,
    commitAmount: Number(row.commitAmount),
    bestCaseAmount: Number(row.bestCaseAmount),
    forecastAmount: Number(row.forecastAmount),
    currency: row.currency,
  };
}

export class PrismaForecastSnapshotStore implements ForecastSnapshotStore {
  async save(record: ForecastSnapshotRecord): Promise<void> {
    await prisma.forecastSnapshot.create({
      data: {
        id: record.id,
        organizationId: record.organizationId,
        period: record.period,
        snapshotAt: new Date(record.snapshotAt),
        rulesVersion: record.rulesVersion,
        commitAmount: record.commitAmount,
        bestCaseAmount: record.bestCaseAmount,
        forecastAmount: record.forecastAmount,
        currency: record.currency,
      },
    });
  }

  async findByPeriod(organizationId: string, period: string): Promise<ForecastSnapshotRecord[]> {
    const rows = await prisma.forecastSnapshot.findMany({
      where: { organizationId, period },
      orderBy: { snapshotAt: 'asc' },
    });
    return rows.map(toRecord);
  }

  async findAll(organizationId: string): Promise<ForecastSnapshotRecord[]> {
    const rows = await prisma.forecastSnapshot.findMany({
      where: { organizationId },
      orderBy: { snapshotAt: 'asc' },
    });
    return rows.map(toRecord);
  }
}
