import { prisma } from '../../../lib/prisma.js';
import type {
  UsageRepository,
  UsageLogRow,
  UsageByModelRow,
  UsageByPromptRow,
} from '../domain/Usage.js';

export class PrismaUsageRepository implements UsageRepository {
  async findLogsSince(organizationId: string, since: Date): Promise<UsageLogRow[]> {
    return prisma.aILog.findMany({
      where: { organizationId, createdAt: { gte: since } },
      select: { createdAt: true, tokens: true, cost: true, latencyMs: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async groupByModel(organizationId: string, since: Date): Promise<UsageByModelRow[]> {
    const rows = await prisma.aILog.groupBy({
      by: ['model'],
      where: { organizationId, createdAt: { gte: since } },
      _sum: { tokens: true, cost: true },
      _avg: { latencyMs: true },
      _count: { _all: true },
    });

    return rows.map((row) => ({
      model: row.model,
      tokens: row._sum.tokens ?? 0,
      cost: row._sum.cost ?? 0,
      calls: row._count._all,
      avgLatencyMs: Math.round(row._avg.latencyMs ?? 0),
    }));
  }

  async groupByPrompt(organizationId: string, since: Date): Promise<UsageByPromptRow[]> {
    const rows = await prisma.aILog.groupBy({
      by: ['promptId'],
      where: { organizationId, createdAt: { gte: since } },
      _sum: { tokens: true, cost: true },
      _count: { _all: true },
    });

    return rows.map((row) => ({
      promptId: row.promptId,
      tokens: row._sum.tokens ?? 0,
      cost: row._sum.cost ?? 0,
      calls: row._count._all,
    }));
  }

  async sumCostSince(organizationId: string, since: Date): Promise<number> {
    const result = await prisma.aILog.aggregate({
      where: { organizationId, createdAt: { gte: since } },
      _sum: { cost: true },
    });
    return result._sum.cost ?? 0;
  }

  async countUnattributed(since: Date): Promise<number> {
    return prisma.aILog.count({ where: { organizationId: null, createdAt: { gte: since } } });
  }
}
