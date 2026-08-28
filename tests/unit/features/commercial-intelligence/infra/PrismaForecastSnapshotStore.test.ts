/**
 * Onda 39 (Agente 04 → Agente 01, handoff resolvido em
 * .agents/handoffs/onda-39/04-para-01-schema-forecast-snapshot.md): implementação real
 * (Prisma/Postgres) de ForecastSnapshotStore, depois que o model ForecastSnapshot passou a
 * existir (migration 20260827020000_forecast_snapshot). Prova o roundtrip save→find e a
 * conversão Decimal (Prisma)→number (contrato ForecastSnapshotRecord), sem depender de Postgres
 * real.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ForecastSnapshotRecord } from '../../../../../src/features/commercial-intelligence/domain/CommercialIntelligence.js';

const create = vi.fn();
const findMany = vi.fn();
vi.mock('../../../../../src/lib/prisma.js', () => ({
    prisma: { forecastSnapshot: { create: (...args: unknown[]) => create(...args), findMany: (...args: unknown[]) => findMany(...args) } },
}));

const { PrismaForecastSnapshotStore } = await import('../../../../../src/features/commercial-intelligence/infra/PrismaForecastSnapshotStore.js');

afterEach(() => {
    vi.clearAllMocks();
});

function record(overrides: Partial<ForecastSnapshotRecord> = {}): ForecastSnapshotRecord {
    return {
        id: 'snap-1',
        organizationId: 'org-1',
        period: '2026-08',
        snapshotAt: '2026-08-10T10:00:00.000Z',
        rulesVersion: 'v1',
        commitAmount: 1000.5,
        bestCaseAmount: 2000.25,
        forecastAmount: 1500,
        currency: 'BRL',
        ...overrides,
    };
}

describe('PrismaForecastSnapshotStore', () => {
    it('save faz um create, nunca um upsert (append-only)', async () => {
        create.mockResolvedValue(undefined);
        const store = new PrismaForecastSnapshotStore();

        await store.save(record());

        expect(create).toHaveBeenCalledWith({
            data: {
                id: 'snap-1',
                organizationId: 'org-1',
                period: '2026-08',
                snapshotAt: new Date('2026-08-10T10:00:00.000Z'),
                rulesVersion: 'v1',
                commitAmount: 1000.5,
                bestCaseAmount: 2000.25,
                forecastAmount: 1500,
                currency: 'BRL',
            },
        });
    });

    it('findByPeriod filtra por organizationId+period, ordena por snapshotAt asc e converte Decimal→number', async () => {
        findMany.mockResolvedValue([
            {
                id: 'snap-1',
                organizationId: 'org-1',
                period: '2026-08',
                snapshotAt: new Date('2026-08-10T10:00:00.000Z'),
                rulesVersion: 'v1',
                // Simula o shape Decimal do Prisma Client — objeto com toString(), não number puro.
                commitAmount: { toString: () => '1000.50' },
                bestCaseAmount: { toString: () => '2000.25' },
                forecastAmount: { toString: () => '1500.00' },
                currency: 'BRL',
            },
        ]);
        const store = new PrismaForecastSnapshotStore();

        const rows = await store.findByPeriod('org-1', '2026-08');

        expect(findMany).toHaveBeenCalledWith({ where: { organizationId: 'org-1', period: '2026-08' }, orderBy: { snapshotAt: 'asc' } });
        expect(rows).toEqual([record({ commitAmount: 1000.5, bestCaseAmount: 2000.25, forecastAmount: 1500 })]);
    });

    it('findAll filtra só por organizationId (todos os períodos)', async () => {
        findMany.mockResolvedValue([]);
        const store = new PrismaForecastSnapshotStore();

        await store.findAll('org-1');

        expect(findMany).toHaveBeenCalledWith({ where: { organizationId: 'org-1' }, orderBy: { snapshotAt: 'asc' } });
    });
});
