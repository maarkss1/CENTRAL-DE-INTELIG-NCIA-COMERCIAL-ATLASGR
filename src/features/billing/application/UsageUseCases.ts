import type { UsageRepository, UsagePoint, UsageSummary } from '../domain/Usage.js';

function startOfDayUtcOffsetDays(days: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d;
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Consumo de IA por organização.
 *
 * Deliberadamente NÃO é um módulo de faturamento: não existe no sistema plano, assinatura, fatura
 * nem provedor de pagamento. O que existe de verdade é o AILog — tokens, custo estimado, latência
 * e modelo de cada chamada. Esta tela mostra isso, e o custo é rotulado como estimativa porque vem
 * de uma tabela de preços por 1M de tokens no gateway, não de uma cobrança real.
 */
export class UsageUseCases {
  constructor(private usageRepository: UsageRepository) {}

  async summary(organizationId: string, days = 30): Promise<UsageSummary> {
    const since = startOfDayUtcOffsetDays(days - 1);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [logs, byModelRows, byPromptRows, costThisMonth, unattributedCalls] = await Promise.all([
      this.usageRepository.findLogsSince(organizationId, since),
      this.usageRepository.groupByModel(organizationId, since),
      this.usageRepository.groupByPrompt(organizationId, since),
      this.usageRepository.sumCostSince(organizationId, monthStart),
      this.usageRepository.countUnattributed(since),
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

    const byModel = [...byModelRows].sort((a, b) => b.cost - a.cost);

    const byPrompt = byPromptRows
      .map((row) => ({
        // Chamadas sem prompt registrado (fluxo antigo ou chamada avulsa) viram "Não identificado"
        // em vez de somem do relatório — mesmo raciocínio de `unattributedCalls` acima.
        promptId: row.promptId ?? 'Não identificado',
        tokens: row.tokens,
        cost: row.cost,
        calls: row.calls,
      }))
      .sort((a, b) => b.cost - a.cost);

    return {
      totalTokens,
      totalCost,
      totalCalls: logs.length,
      avgLatencyMs: logs.length > 0 ? Math.round(latencySum / logs.length) : 0,
      costThisMonth,
      byModel,
      byPrompt,
      daily: [...buckets.values()],
      unattributedCalls,
      isEmpty: logs.length === 0,
    };
  }
}
