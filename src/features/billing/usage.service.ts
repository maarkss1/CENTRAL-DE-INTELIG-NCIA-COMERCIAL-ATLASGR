import { prisma } from '../../lib/prisma.js';

/**
 * Consumo de IA por organização.
 *
 * Deliberadamente NÃO é um módulo de faturamento: não existe no sistema plano, assinatura, fatura
 * nem provedor de pagamento. O que existe de verdade é o AILog — tokens, custo estimado, latência
 * e modelo de cada chamada. Esta tela mostra isso, e o custo é rotulado como estimativa porque vem
 * de uma tabela de preços por 1M de tokens no gateway, não de uma cobrança real.
 */

export interface UsagePoint {
    day: string;
    tokens: number;
    cost: number;
    calls: number;
}

export interface UsageByModel {
    model: string;
    tokens: number;
    cost: number;
    calls: number;
    avgLatencyMs: number;
}

export interface UsageSummary {
    totalTokens: number;
    totalCost: number;
    totalCalls: number;
    avgLatencyMs: number;
    /** Custo do mês corrente, para comparação com o período todo. */
    costThisMonth: number;
    byModel: UsageByModel[];
    daily: UsagePoint[];
    /** Chamadas gravadas antes da coluna de tenant existir, ou feitas fora de requisição. */
    unattributedCalls: number;
    isEmpty: boolean;
}

function startOfDayUtcOffsetDays(days: number): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - days);
    return d;
}

function dayKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export class UsageService {
    async summary(organizationId: string, days = 30): Promise<UsageSummary> {
        const since = startOfDayUtcOffsetDays(days - 1);
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);

        const scope = { organizationId, createdAt: { gte: since } };

        const [logs, byModelRows, monthAggregate, unattributedCalls] = await Promise.all([
            prisma.aILog.findMany({
                where: scope,
                select: { createdAt: true, tokens: true, cost: true, latencyMs: true },
                orderBy: { createdAt: 'asc' },
            }),
            prisma.aILog.groupBy({
                by: ['model'],
                where: scope,
                _sum: { tokens: true, cost: true },
                _avg: { latencyMs: true },
                _count: { _all: true },
            }),
            prisma.aILog.aggregate({
                where: { organizationId, createdAt: { gte: monthStart } },
                _sum: { cost: true },
            }),
            prisma.aILog.count({ where: { organizationId: null, createdAt: { gte: since } } }),
        ]);

        // Pré-popula os dias para o gráfico não ter buracos onde não houve chamada.
        const buckets = new Map<string, UsagePoint>();
        for (let i = days - 1; i >= 0; i--) {
            const key = dayKey(startOfDayUtcOffsetDays(i));
            buckets.set(key, { day: key, tokens: 0, cost: 0, calls: 0 });
        }

        let totalTokens = 0;
        let totalCost = 0;
        let latencySum = 0;

        for (const log of logs) {
            totalTokens += log.tokens;
            totalCost += log.cost;
            latencySum += log.latencyMs;

            const bucket = buckets.get(dayKey(log.createdAt));
            if (bucket) {
                bucket.tokens += log.tokens;
                bucket.cost += log.cost;
                bucket.calls += 1;
            }
        }

        const byModel: UsageByModel[] = byModelRows
            .map((row) => ({
                model: row.model,
                tokens: row._sum.tokens ?? 0,
                cost: row._sum.cost ?? 0,
                calls: row._count._all,
                avgLatencyMs: Math.round(row._avg.latencyMs ?? 0),
            }))
            .sort((a, b) => b.cost - a.cost);

        return {
            totalTokens,
            totalCost,
            totalCalls: logs.length,
            avgLatencyMs: logs.length > 0 ? Math.round(latencySum / logs.length) : 0,
            costThisMonth: monthAggregate._sum.cost ?? 0,
            byModel,
            daily: [...buckets.values()],
            unattributedCalls,
            isEmpty: logs.length === 0,
        };
    }
}

export const usageService = new UsageService();
