import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Onda 43: o model ForecastSnapshot existia desde a Onda 39 (migration
 * 20260827020000_forecast_snapshot) mas nenhum cron/worker jamais o populava em produção
 * (handoff onda-39/04-para-16-cron-forecast-snapshot-semanal.md, agora resolvido). Este teste
 * prova, com Prisma/use cases mockados (sem depender de Postgres real), que o job:
 * (1) descobre TODA organização com lead (mesmo padrão de descoberta cross-tenant já auditado em
 *     weeklyPdfReport.worker.ts), não só a primeira;
 * (2) calcula o ExecutiveOverview do mês corrente dentro do tenant correto (`requestContext`);
 * (3) grava um snapshot append-only por organização, e uma falha isolada não derruba o job inteiro
 *     nem inventa sucesso para essa organização.
 */

vi.mock('../../../../src/lib/queue/redis.js', () => ({ connection: {} }));

const leadFindMany = vi.fn();
vi.mock('../../../../src/lib/prisma.js', () => ({
    prisma: {
        lead: { findMany: (...args: unknown[]) => leadFindMany(...args) },
    },
}));

const executiveOverviewMock = vi.fn();
vi.mock('../../../../src/features/commercial-intelligence/application/CommercialIntelligenceUseCases.js', () => ({
    CommercialIntelligenceUseCases: class {
        executiveOverview(...args: unknown[]) {
            return executiveOverviewMock(...args);
        }
    },
    currentPeriod: () => '2026-08',
}));

vi.mock('../../../../src/features/commercial-intelligence/infra/PrismaCommercialIntelligenceRepository.js', () => ({
    PrismaCommercialIntelligenceRepository: class {},
}));

const storeSave = vi.fn();
vi.mock('../../../../src/features/commercial-intelligence/infra/PrismaForecastSnapshotStore.js', () => ({
    PrismaForecastSnapshotStore: class {
        save(...args: unknown[]) {
            return storeSave(...args);
        }
    },
}));

import { requestContext } from '../../../../src/lib/async-context';
import { runForecastSnapshotWeeklyJob } from '../../../../src/features/commercial-intelligence/jobs/forecastSnapshotWeekly.worker';

const NOW = new Date('2026-08-31T09:00:00Z');

function fakeOverview(overrides: Record<string, unknown> = {}) {
    return {
        period: '2026-08',
        goal: null,
        closedAmount: 0,
        closedCount: 0,
        pctOfGoal: 0,
        commitAmount: 40_000,
        commitCount: 2,
        bestCaseAmount: 20_000,
        bestCaseCount: 1,
        upsideAmount: 0,
        upsideCount: 0,
        forecastAmount: 60_000,
        gapForecast: 0,
        gapCommit: 0,
        pipelineTotal: 60_000,
        pipelineTotalCount: 3,
        pipelineEligible: 60_000,
        pipelineEligibleCount: 3,
        coverageMonth: { coverage: null, coverageRecommended: null, pipelineEligible: 0, remainingGoal: 0 },
        coverage30: { coverage: null, coverageRecommended: null, pipelineEligible: 0, remainingGoal: 0 },
        coverage60: { coverage: null, coverageRecommended: null, pipelineEligible: 0, remainingGoal: 0 },
        coverage90: { coverage: null, coverageRecommended: null, pipelineEligible: 0, remainingGoal: 0 },
        coverageProtection: [],
        previousPeriod: null,
        forecastConfidence: {
            score: null,
            classification: null,
            sampleSize: 0,
            fieldCompletenessScore: null,
            stageHistoryCoverage: null,
            sampleSizePenaltyApplied: false,
        },
        isEmpty: false,
        dataAsOf: NOW.toISOString(),
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    executiveOverviewMock.mockResolvedValue(fakeOverview());
    storeSave.mockResolvedValue(undefined);
});

describe('runForecastSnapshotWeeklyJob — descoberta cross-tenant', () => {
    it('processa TODA organização com lead, não só a primeira', async () => {
        leadFindMany.mockResolvedValue([
            { organizationId: 'org-a' },
            { organizationId: 'org-a' }, // duplicata real (leads diferentes, mesma org) — dedupe esperado
            { organizationId: 'org-b' },
        ]);

        const result = await runForecastSnapshotWeeklyJob(NOW);

        expect(result.status).toBe('completed');
        if (result.status !== 'completed') throw new Error('unreachable');
        const orgIds = result.results.map((r) => r.organizationId).sort();
        expect(orgIds).toEqual(['org-a', 'org-b']);
        expect(storeSave).toHaveBeenCalledTimes(2);
    });

    it('a descoberta cross-tenant roda com bypass, e o cálculo por organização roda com o tenant real (nunca bypass)', async () => {
        leadFindMany.mockImplementation(async () => {
            expect(requestContext.getStore()?.bypassRls).toBe(true);
            return [{ organizationId: 'org-a' }];
        });
        executiveOverviewMock.mockImplementation(async (organizationId: string) => {
            expect(requestContext.getStore()?.tenantId).toBe(organizationId);
            expect(requestContext.getStore()?.bypassRls).toBeUndefined();
            return fakeOverview();
        });

        const result = await runForecastSnapshotWeeklyJob(NOW);

        expect(result.status).toBe('completed');
        expect(storeSave).toHaveBeenCalledWith(
            expect.objectContaining({ organizationId: 'org-a', period: '2026-08' }),
        );
    });

    it('nenhuma organização com lead: reporta o estado real, não um "completed" vazio', async () => {
        leadFindMany.mockResolvedValue([]);

        const result = await runForecastSnapshotWeeklyJob(NOW);

        expect(result).toEqual({ status: 'no_organizations_with_leads' });
        expect(executiveOverviewMock).not.toHaveBeenCalled();
    });

    it('falha ao calcular/gravar o snapshot de uma organização não derruba o job nem as demais organizações', async () => {
        leadFindMany.mockResolvedValue([{ organizationId: 'org-a' }, { organizationId: 'org-b' }]);
        executiveOverviewMock
            .mockRejectedValueOnce(new Error('Postgres indisponível'))
            .mockResolvedValueOnce(fakeOverview());

        const result = await runForecastSnapshotWeeklyJob(NOW);

        expect(result.status).toBe('completed');
        if (result.status !== 'completed') throw new Error('unreachable');
        expect(result.results).toEqual(
            expect.arrayContaining([
                { organizationId: 'org-a', status: 'failed' },
                { organizationId: 'org-b', status: 'saved' },
            ]),
        );
        expect(storeSave).toHaveBeenCalledTimes(1);
    });
});
