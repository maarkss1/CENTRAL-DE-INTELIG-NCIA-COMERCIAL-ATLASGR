/**
 * Analytics sobre `LeadStageHistory` reaproveitadas por mais de um relatório (Performance/Funil,
 * Leading Indicators, Alertas) — contagem de transições de etapa e alcance histórico do funil.
 * Isoladas aqui porque nenhuma delas depende de forecast/scoring, só de movimentação real de etapa.
 */

import { isDealOpen } from '../pipelineEligibility';
import { roundMoney } from '../shared/mathUtils';
import type { ScoredDeal, StageHistoryRow } from './dealScoring';

/** Quantas transições de etapa (2ª+ linha de histórico de um lead) aconteceram dentro de [start, end). */
export function countAdvancedTransitions(
  history: StageHistoryRow[],
  start: Date,
  end: Date,
): number {
  const byLead = new Map<string, StageHistoryRow[]>();
  for (const row of history) {
    if (!byLead.has(row.leadId)) byLead.set(row.leadId, []);
    byLead.get(row.leadId)!.push(row);
  }
  let advanced = 0;
  for (const rows of byLead.values()) {
    const sorted = [...rows].sort((a, b) => a.enteredAt.getTime() - b.enteredAt.getTime());
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].enteredAt >= start && sorted[i].enteredAt < end) advanced++;
    }
  }
  return advanced;
}

/**
 * Quantos negócios (abertos, ganhos OU perdidos, no escopo do filtro) REALMENTE chegaram a
 * cada etapa ABERTA em algum momento — seção 12: não inferir conversão só pelo snapshot atual
 * quando há histórico disponível.
 *
 * Só recebe as etapas ABERTAS (`openStages`, sem Ganho/Perdido) de propósito: a etapa terminal
 * NUNCA entra no cálculo de "alcançou", nem via histórico nem via etapa atual — se entrasse,
 * um negócio perdido logo na 1ª etapa pareceria ter "alcançado" todas as etapas intermediárias
 * só porque a etapa "Perdido" tem `sortOrder` mais alto que elas (bug real testado em
 * `__tests__/CommercialIntelligenceUseCases.unit.test.ts`). Um negócio GANHO só conta como
 * tendo alcançado uma etapa aberta se o histórico tiver uma linha própria para aquela etapa
 * aberta (o que acontece naturalmente se ele passou por ali antes de fechar). Para negócios
 * ABERTOS, a etapa atual sempre conta como alcançada, mesmo sem linha de histórico (registro
 * legado). Sem nenhuma linha de histórico para um negócio fechado, ele não é contado em
 * nenhuma etapa — nunca um progresso fabricado a partir do status final.
 */
export function computeHistoricalStageReach(
  inScope: ScoredDeal[],
  history: StageHistoryRow[],
  openStages: Array<{ id: string; sortOrder: number }>,
): Map<string, { count: number; amount: number }> {
  const sortOrderByOpenStageId = new Map(openStages.map((s) => [s.id, s.sortOrder]));
  const historyByLead = new Map<string, StageHistoryRow[]>();
  for (const row of history) {
    if (!historyByLead.has(row.leadId)) historyByLead.set(row.leadId, []);
    historyByLead.get(row.leadId)!.push(row);
  }

  const reachedByDeal = inScope.map((s) => {
    const reached = new Set<number>();
    for (const row of historyByLead.get(s.deal.id) ?? []) {
      const so = row.stageId ? sortOrderByOpenStageId.get(row.stageId) : undefined;
      if (so != null) reached.add(so);
    }
    if (isDealOpen(s.deal) && s.deal.stageSortOrder != null) reached.add(s.deal.stageSortOrder);
    return { deal: s.deal, reached };
  });

  const result = new Map<string, { count: number; amount: number }>();
  for (const stage of openStages) {
    const dealsThatReached = reachedByDeal.filter(({ reached }) =>
      [...reached].some((so) => so >= stage.sortOrder),
    );
    result.set(stage.id, {
      count: dealsThatReached.length,
      amount: roundMoney(dealsThatReached.reduce((sum, r) => sum + r.deal.amount, 0)),
    });
  }
  return result;
}
