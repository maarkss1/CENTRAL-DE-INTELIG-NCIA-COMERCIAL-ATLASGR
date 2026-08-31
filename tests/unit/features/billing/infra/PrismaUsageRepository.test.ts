import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    aILog: { findMany: vi.fn(), groupBy: vi.fn(), aggregate: vi.fn(), count: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';
import { PrismaUsageRepository } from '@/features/billing/infra/PrismaUsageRepository';

const log = prisma.aILog as unknown as Record<string, ReturnType<typeof vi.fn>>;
const repo = new PrismaUsageRepository();
const ORG = 'org-1';
const SINCE = new Date('2026-01-01T00:00:00.000Z');

beforeEach(() => {
  vi.clearAllMocks();
  log.findMany.mockResolvedValue([]);
  log.groupBy.mockResolvedValue([]);
  log.aggregate.mockResolvedValue({ _sum: { cost: 0 } });
  log.count.mockResolvedValue(0);
});

describe('PrismaUsageRepository', () => {
  it('findLogsSince escopa por organização e período', async () => {
    await repo.findLogsSince(ORG, SINCE);
    expect(log.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: ORG, createdAt: { gte: SINCE } } }),
    );
  });

  it('groupByModel trata somas nulas do groupBy como zero', async () => {
    log.groupBy.mockResolvedValue([
      {
        model: 'x',
        _sum: { tokens: null, cost: null },
        _avg: { latencyMs: null },
        _count: { _all: 0 },
      },
    ]);

    const result = await repo.groupByModel(ORG, SINCE);
    expect(result[0]).toMatchObject({ tokens: 0, cost: 0, avgLatencyMs: 0 });
  });

  it('groupByPrompt repassa promptId cru (null incluído) para a camada de aplicação decidir o rótulo', async () => {
    log.groupBy.mockResolvedValue([
      { promptId: null, _sum: { tokens: 100, cost: 0.01 }, _count: { _all: 1 } },
    ]);

    const result = await repo.groupByPrompt(ORG, SINCE);
    expect(result[0].promptId).toBeNull();
  });

  it('sumCostSince trata soma nula como zero', async () => {
    log.aggregate.mockResolvedValue({ _sum: { cost: null } });
    expect(await repo.sumCostSince(ORG, SINCE)).toBe(0);
  });

  it('countUnattributed consulta por organizationId nulo, não pela organização pedida', async () => {
    await repo.countUnattributed(SINCE);
    expect(log.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: null }) }),
    );
  });
});
