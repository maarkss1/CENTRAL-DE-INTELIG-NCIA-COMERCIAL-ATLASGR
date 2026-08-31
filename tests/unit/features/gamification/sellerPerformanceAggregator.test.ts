import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
    prisma: {
        lead: {
            count: vi.fn(),
            aggregate: vi.fn(),
            groupBy: vi.fn(),
        },
        activity: {
            count: vi.fn(),
        },
    },
}));

import { prisma } from '@/lib/prisma';
import { SellerPerformanceAggregatorService } from '@/features/gamification/services/sellerPerformanceAggregator.service';

type Mocked<T> = { [K in keyof T]: ReturnType<typeof vi.fn> };
const lead = prisma.lead as unknown as Mocked<typeof prisma.lead>;
const activity = prisma.activity as unknown as Mocked<typeof prisma.activity>;

const service = new SellerPerformanceAggregatorService();
const ORG = 'org-1';
const OWNER = 'Maria Silva';
const period = { from: new Date('2026-08-24T00:00:00Z'), to: new Date('2026-08-31T00:00:00Z') };

beforeEach(() => {
    vi.clearAllMocks();
});

describe('SellerPerformanceAggregatorService.compute', () => {
    it('calcula ligações, reuniões, negócios fechados, ticket médio e conversão a partir de dados reais', async () => {
        activity.count.mockResolvedValueOnce(42).mockResolvedValueOnce(8);
        lead.aggregate.mockResolvedValue({ _avg: { amount: 15000 } });
        lead.count.mockResolvedValueOnce(3).mockResolvedValueOnce(10);
        lead.groupBy.mockResolvedValue([]);

        const result = await service.compute(ORG, OWNER, period);

        expect(result.callsMade).toBe(42);
        expect(result.meetingsScheduled).toBe(8);
        expect(result.dealsClosed).toBe(3);
        expect(result.avgTicket).toBe(15000);
        expect(result.conversionRatePercent).toBe(30);
    });

    it('não gera NaN/Infinity quando não há leads qualificados no denominador', async () => {
        activity.count.mockResolvedValue(0);
        lead.aggregate.mockResolvedValue({ _avg: { amount: null } });
        lead.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
        lead.groupBy.mockResolvedValue([]);

        const result = await service.compute(ORG, OWNER, period);

        expect(result.conversionRatePercent).toBe(0);
        expect(Number.isFinite(result.conversionRatePercent)).toBe(true);
        expect(result.avgTicket).toBe(0);
    });

    it('topLossReason fica undefined quando não há negócios perdidos no período, nunca uma string fabricada', async () => {
        activity.count.mockResolvedValue(0);
        lead.aggregate.mockResolvedValue({ _avg: { amount: null } });
        lead.count.mockResolvedValue(0);
        lead.groupBy.mockResolvedValue([]);

        const result = await service.compute(ORG, OWNER, period);

        expect(result.topLossReason).toBeUndefined();
    });

    it('topLossReason escolhe o motivo com maior contagem quando há mais de um', async () => {
        activity.count.mockResolvedValue(0);
        lead.aggregate.mockResolvedValue({ _avg: { amount: null } });
        lead.count.mockResolvedValue(0);
        lead.groupBy.mockResolvedValue([
            { lossReason: 'Preço', _count: { _all: 2 } },
            { lossReason: 'Timing', _count: { _all: 5 } },
        ]);

        const result = await service.compute(ORG, OWNER, period);

        expect(result.topLossReason).toBe('Timing');
    });

    it('escopa toda consulta por organizationId e owner — nunca vaza dado de outro vendedor/tenant', async () => {
        activity.count.mockResolvedValue(0);
        lead.aggregate.mockResolvedValue({ _avg: { amount: null } });
        lead.count.mockResolvedValue(0);
        lead.groupBy.mockResolvedValue([]);

        await service.compute(ORG, OWNER, period);

        for (const call of activity.count.mock.calls) {
            expect(call[0].where.organizationId).toBe(ORG);
            expect(call[0].where.owner).toBe(OWNER);
        }
        for (const call of lead.count.mock.calls) {
            expect(call[0].where.organizationId).toBe(ORG);
            expect(call[0].where.owner).toBe(OWNER);
        }
        expect(lead.aggregate.mock.calls[0][0].where.organizationId).toBe(ORG);
        expect(lead.aggregate.mock.calls[0][0].where.owner).toBe(OWNER);
        expect(lead.groupBy.mock.calls[0][0].where.organizationId).toBe(ORG);
        expect(lead.groupBy.mock.calls[0][0].where.owner).toBe(OWNER);
    });
});
