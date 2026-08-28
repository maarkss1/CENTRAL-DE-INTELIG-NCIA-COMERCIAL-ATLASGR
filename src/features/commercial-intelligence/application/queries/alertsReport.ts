/**
 * Alertas executivos (Fase 6) — o único relatório que COMPÕE outros relatórios (Overview, Pipeline
 * Creation, Aging, Performance atual/anterior) em vez de calcular a partir de negócios pontuados
 * diretamente. Cada alerta é derivado de uma métrica real já calculada alhures — nenhum texto de
 * incentivo genérico, nenhum limiar novo introduzido aqui além dos já documentados nos relatórios
 * de origem.
 */

import type {
  CommercialIntelligenceFilter,
  CommercialIntelligenceRepository,
  ExecutiveAlert,
} from '../../domain/CommercialIntelligence';
import { roundMoney } from '../shared/mathUtils';
import { loadScoredDeals } from '../scoring/dealScoring';
import { isDealOpen } from '../pipelineEligibility';
import { buildExecutiveOverview } from './executiveOverviewReport';
import { buildPipelineCreation } from './pipelineCreationReport';
import { buildAging } from './agingReport';
import { buildPerformance } from './performanceReport';

export async function buildAlerts(
  repository: CommercialIntelligenceRepository,
  organizationId: string,
  filter: CommercialIntelligenceFilter,
  now: Date,
): Promise<ExecutiveAlert[]> {
  const [overview, creation, aging] = await Promise.all([
    buildExecutiveOverview(repository, organizationId, filter, now),
    buildPipelineCreation(repository, organizationId, filter, now),
    buildAging(repository, organizationId, filter, now),
  ]);

  const alerts: ExecutiveAlert[] = [];

  if (overview.goal && overview.forecastAmount < overview.goal.amount) {
    const pct =
      overview.goal.amount > 0
        ? Math.round((overview.forecastAmount / overview.goal.amount) * 100)
        : 0;
    alerts.push({
      id: 'forecast-abaixo-meta',
      severity: 'critical',
      title: 'Forecast abaixo da meta',
      description: `Forecast atual cobre apenas ${pct}% da meta. Gap estimado: ${(overview.gapForecast ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: overview.goal.currency })}.`,
      metricValue: overview.gapForecast,
    });
  }

  if (
    overview.coverage90.coverage != null &&
    overview.coverage90.coverageRecommended != null &&
    overview.coverage90.coverage < overview.coverage90.coverageRecommended
  ) {
    alerts.push({
      id: 'coverage-insuficiente-90d',
      severity: 'warning',
      title: 'Coverage insuficiente nos próximos 90 dias',
      description: `Coverage atual de ${overview.coverage90.coverage.toFixed(1)}x está abaixo do recomendado (${overview.coverage90.coverageRecommended.toFixed(1)}x, derivado do Win Rate histórico).`,
      metricValue: overview.coverage90.coverage,
    });
  }

  if (creation.creationCoverage != null && creation.creationCoverage < 1) {
    const pctBelow = Math.round((1 - creation.creationCoverage) * 100);
    alerts.push({
      id: 'baixa-criacao-pipeline',
      severity: 'warning',
      title: 'Baixa criação de pipeline',
      description: `Pipeline criado no mês está ${pctBelow}% abaixo do ritmo necessário para sustentar a meta futura.`,
      metricValue: creation.creationCoverage,
    });
  }

  const stagnantAmount = roundMoney(
    aging.byStage.reduce((sum, s) => sum + s.amountOverThreshold, 0),
  );
  if (stagnantAmount > 0) {
    alerts.push({
      id: 'oportunidades-estagnadas',
      severity: 'critical',
      title: 'Oportunidades estagnadas',
      description: `${stagnantAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} em oportunidades estão acima do aging esperado (${aging.criticalThresholdDays} dias na etapa).`,
      metricValue: stagnantAmount,
    });
  }

  const { scored } = await loadScoredDeals(repository, organizationId, now);
  const openScope = filter.owner ? scored.filter((s) => s.deal.owner === filter.owner) : scored;
  const noNextAction = openScope.filter(
    (s) => isDealOpen(s.deal) && s.deal.amount > 0 && !s.deal.nextAction,
  );
  if (noNextAction.length > 0) {
    alerts.push({
      id: 'sem-proxima-acao',
      severity: 'warning',
      title: 'Sem próxima ação',
      description: `${noNextAction.length} oportunidade(s) relevante(s) estão sem próxima atividade registrada.`,
      metricValue: noNextAction.length,
    });
  }

  // ─── Propostas sem interação (seção 19, atenção) ─────────────────────────────
  // Não usa o nome literal de uma etapa (ex.: "Proposta Enviada") porque pipelines
  // customizados não padronizam nomes — usa o tier do Forecast Ponderado Explicável (Commit/
  // BestCase = oportunidade já avançada, com proposta em curso) combinado com o próprio sinal
  // de "sem interação"/"interação vencida" que o forecastEngine já calcula por negócio.
  const proposalsWithoutInteraction = openScope.filter(
    (s) =>
      isDealOpen(s.deal) &&
      (s.forecast.tier === 'Commit' || s.forecast.tier === 'BestCase') &&
      s.forecast.negativeFactors.some((f) => f.toLowerCase().includes('interação')),
  );
  if (proposalsWithoutInteraction.length > 0) {
    alerts.push({
      id: 'propostas-sem-interacao',
      severity: 'warning',
      title: 'Propostas sem interação recente',
      description: `${proposalsWithoutInteraction.length} negócio(s) já avançado(s) (Commit/Best Case) estão sem interação recente registrada — risco de esfriar antes do fechamento.`,
      metricValue: proposalsWithoutInteraction.length,
    });
  }

  // ─── Confiabilidade do forecast (seção 19, crítico) ──────────────────────────
  if (overview.forecastConfidence.classification === 'critico') {
    alerts.push({
      id: 'forecast-confidence-critica',
      severity: 'critical',
      title: 'Dados essenciais do forecast com baixa completude',
      description: `Confiabilidade do forecast em ${overview.forecastConfidence.score ?? 0}% — campos-chave (valor, responsável, data prevista, próxima ação, interação) ou histórico de etapa estão incompletos na maior parte do pipeline aberto.`,
      metricValue: overview.forecastConfidence.score,
    });
  }

  // ─── Proteção 90 dias: M+1/M+2 abaixo do mínimo (seção 19, atenção) ──────────
  const [, m1, m2] = overview.coverageProtection;
  const criticalFutureMonths = [m1, m2].filter((m) => m.status === 'critico');
  if (criticalFutureMonths.length > 0) {
    alerts.push({
      id: 'coverage-futuro-critico',
      severity: 'warning',
      title: 'Cobertura futura abaixo do mínimo',
      description: `${criticalFutureMonths.map((m) => m.label).join(' e ')} está(ão) com Coverage crítico frente à meta cadastrada. Reforce a geração de pipeline elegível para esses meses antes que a janela feche.`,
      metricValue: criticalFutureMonths[0].coverage,
    });
  }

  // ─── Comparação com o mês anterior: Win Rate e Sales Cycle (seção 19) ────────
  const currentPerformance = await buildPerformance(repository, organizationId, filter, now);
  const previousPerformance = overview.previousPeriod
    ? await buildPerformance(
        repository,
        organizationId,
        { ...filter, month: overview.previousPeriod.period },
        now,
      )
    : null;

  if (currentPerformance.winRate != null && previousPerformance?.winRate != null) {
    const delta = roundMoney(currentPerformance.winRate - previousPerformance.winRate);
    if (delta <= -5) {
      alerts.push({
        id: 'queda-win-rate',
        severity: 'warning',
        title: 'Queda significativa de Win Rate',
        description: `Win Rate caiu de ${previousPerformance.winRate.toFixed(1)}% (${overview.previousPeriod?.period}) para ${currentPerformance.winRate.toFixed(1)}% neste mês.`,
        metricValue: delta,
      });
    } else if (delta >= 5) {
      alerts.push({
        id: 'win-rate-em-alta',
        severity: 'positive',
        title: 'Win Rate acima do mês anterior',
        description: `Win Rate subiu de ${previousPerformance.winRate.toFixed(1)}% para ${currentPerformance.winRate.toFixed(1)}% em relação a ${overview.previousPeriod?.period}.`,
        metricValue: delta,
      });
    }
  }

  if (
    currentPerformance.salesCycle.meanDays != null &&
    previousPerformance?.salesCycle.meanDays != null &&
    previousPerformance.salesCycle.sampleSize > 0 &&
    currentPerformance.salesCycle.meanDays > previousPerformance.salesCycle.meanDays * 1.2
  ) {
    alerts.push({
      id: 'sales-cycle-aumentando',
      severity: 'warning',
      title: 'Sales Cycle aumentando',
      description: `Ciclo médio de venda subiu de ${Math.round(previousPerformance.salesCycle.meanDays)} para ${Math.round(currentPerformance.salesCycle.meanDays)} dias em relação ao mês anterior.`,
      metricValue: currentPerformance.salesCycle.meanDays,
    });
  }

  // ─── Alertas positivos (seção 19) ─────────────────────────────────────────────
  if (overview.goal && overview.forecastAmount >= overview.goal.amount) {
    alerts.push({
      id: 'forecast-acima-meta',
      severity: 'positive',
      title: 'Forecast acima da meta',
      description: `Forecast atual (${overview.forecastAmount.toLocaleString('pt-BR', { style: 'currency', currency: overview.goal.currency })}) já cobre a meta do mês.`,
      metricValue: overview.forecastAmount,
    });
  }

  const futureMonths = overview.coverageProtection.slice(1);
  if (futureMonths.length > 0 && futureMonths.every((m) => m.status === 'saudavel')) {
    alerts.push({
      id: 'coverage-futuro-saudavel',
      severity: 'positive',
      title: 'Cobertura futura saudável',
      description:
        'M+1, M+2 e M+3 estão com Coverage saudável frente à meta cadastrada — pipeline elegível suficiente para sustentar os próximos 90 dias.',
      metricValue: null,
    });
  }

  if (creation.pacePercent != null && creation.pacePercent >= 100) {
    alerts.push({
      id: 'ritmo-criacao-acima',
      severity: 'positive',
      title: 'Pipeline Creation acima do ritmo necessário',
      description: `Pipeline criado até agora está em ${creation.pacePercent.toFixed(0)}% do ritmo necessário para sustentar as metas futuras.`,
      metricValue: creation.pacePercent,
    });
  }

  return alerts;
}
