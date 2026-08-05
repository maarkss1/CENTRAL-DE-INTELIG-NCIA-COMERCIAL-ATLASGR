import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
    prisma: {
        company: { count: vi.fn() },
        contact: { count: vi.fn() },
        activity: { count: vi.fn() },
        lead: {
            count: vi.fn(),
            findMany: vi.fn(),
            aggregate: vi.fn(),
            groupBy: vi.fn(),
        },
    },
}));

import { prisma } from '@/lib/prisma';
import { analyticsService } from '@/features/analytics/analytics.service';

const ORG = 'org-1';

type Mocked<T> = { [K in keyof T]: ReturnType<typeof vi.fn> };
const company = prisma.company as unknown as Mocked<typeof prisma.company>;
const contact = prisma.contact as unknown as Mocked<typeof prisma.contact>;
const activity = prisma.activity as unknown as Mocked<typeof prisma.activity>;
const lead = prisma.lead as unknown as Mocked<typeof prisma.lead>;

beforeEach(() => {
    vi.clearAllMocks();
    company.count.mockResolvedValue(0);
    contact.count.mockResolvedValue(0);
    activity.count.mockResolvedValue(0);
    lead.count.mockResolvedValue(0);
    lead.findMany.mockResolvedValue([]);
    lead.aggregate.mockResolvedValue({ _avg: { score: null } });
});

// TEST: closedAt (não updatedAt) precisa ser o campo usado para "fechado no mês" — updatedAt é
// @updatedAt e sobe em QUALQUER update do lead (sync do Bitrix, uma ligação tocando só
// lastInteraction), não só em mudança de status. Ver comentário em PrismaLeadRepository.updateStatus.
describe('AnalyticsService.overview — janela de fechamento do mês', () => {
    it('conta "ganho no mês" e "perdido no mês" filtrando por closedAt, não updatedAt', async () => {
        await analyticsService.overview(ORG, new Date('2026-08-15T12:00:00Z'));

        const wonCall = lead.count.mock.calls.find(([args]) => args.where.status === 'Fechado_Ganho');
        const lostCall = lead.count.mock.calls.find(([args]) => args.where.status === 'Fechado_Perdido');

        expect(wonCall?.[0].where).toHaveProperty('closedAt');
        expect(wonCall?.[0].where).not.toHaveProperty('updatedAt');
        expect(lostCall?.[0].where).toHaveProperty('closedAt');
        expect(lostCall?.[0].where).not.toHaveProperty('updatedAt');
    });
});

describe('AnalyticsService.monthly — série de ganhos/perdidos', () => {
    it('busca os leads fechados filtrando e selecionando closedAt, não updatedAt', async () => {
        await analyticsService.monthly(ORG, 3, new Date('2026-08-15T12:00:00Z'));

        const closedCall = lead.findMany.mock.calls.find(([args]) => args.where.status?.in);
        expect(closedCall?.[0].where).toHaveProperty('closedAt');
        expect(closedCall?.[0].where).not.toHaveProperty('updatedAt');
        expect(closedCall?.[0].select).toEqual({ closedAt: true, status: true });
    });

    it('agrupa um lead fechado no mês do closedAt dele, não do createdAt/updatedAt', async () => {
        lead.findMany
            .mockResolvedValueOnce([]) // created
            .mockResolvedValueOnce([{ closedAt: new Date('2026-08-10T00:00:00Z'), status: 'Fechado_Ganho' }]); // closed

        const result = await analyticsService.monthly(ORG, 3, new Date('2026-08-15T12:00:00Z'));
        const augustBucket = result.find((m) => m.month === '2026-08');

        expect(augustBucket?.won).toBe(1);
        expect(augustBucket?.lost).toBe(0);
    });
});
