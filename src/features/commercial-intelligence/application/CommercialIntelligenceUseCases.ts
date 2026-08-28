/**
 * Fachada pública do módulo "Comercial Inteligente" (Revenue Command Center executivo).
 *
 * Esta classe NÃO contém mais lógica de negócio própria — ela só implementa a API pública estável
 * consumida por `CommercialIntelligenceController`, `CommercialIntelligenceAiService` e
 * `market-intelligence/server/economicScenario.service.ts`, delegando cada método a um módulo
 * coeso de `application/`:
 *
 * - `scoring/dealScoring.ts` — carrega negócios + histórico e aplica o Forecast Ponderado
 *   Explicável a cada um (`ScoredDeal`), a base comum de todo relatório.
 * - `scoring/scopeFilter.ts` — aplica o filtro (owner/produto/origem/ICP/empresa).
 * - `scoring/stageHistoryAnalytics.ts` — transições de etapa e alcance histórico do funil.
 * - `dataReadiness.ts` — completude ponderada por impacto no forecast ("Confiabilidade dos Dados").
 * - `coverageProtection.ts` — classificação da "Proteção 90 dias".
 * - `goalCommands.ts` — leitura/escrita de `CommercialGoal` (único ponto de escrita do módulo).
 * - `queries/*.ts` — um arquivo por relatório (Overview, Pipeline Creation, Performance, Aging,
 *   Losses, Leading Indicators, Alerts, CRM Quality, Bitrix Sync Health, Drill-down, Historical
 *   Trends), cada um testável isoladamente com um repositório fake, sem depender desta fachada.
 *
 * Manter esta classe como fachada (em vez de apagá-la e expor as funções soltas) preserva 100% da
 * API pública já consumida fora deste módulo — nenhuma migração de import foi necessária nos
 * consumidores existentes.
 */
import type {
  CommercialIntelligenceFilter,
  CommercialIntelligenceRepository,
  CommercialGoalDTO,
  DealDrillDownQuery,
  DealDrillDownResult,
  ExecutiveOverview,
  PipelineCreation,
  PerformanceMetrics,
  AgingReport,
  LossAnalysis,
  LeadingIndicatorsReport,
  ExecutiveAlert,
  CrmQualityIndex,
  ForecastExplain,
  GoalMetric,
  ExportFormat,
  FilterOptions,
  HistoricalTrendsReport,
  ForecastAccuracySummary,
  HealthScoreResult,
} from '../domain/CommercialIntelligence';
import { getGoal as getGoalCommand, setGoal as setGoalCommand } from './goalCommands';
import { buildExecutiveOverview } from './queries/executiveOverviewReport';
import { buildPipelineCreation } from './queries/pipelineCreationReport';
import { buildPerformance } from './queries/performanceReport';
import { buildAging } from './queries/agingReport';
import { buildLosses } from './queries/lossesReport';
import { buildLeadingIndicators } from './queries/leadingIndicatorsReport';
import { buildAlerts } from './queries/alertsReport';
import { buildCrmQuality } from './queries/crmQualityReport';
import { buildDealsDrillDown, buildForecastExplain } from './queries/drillDownReport';
import { buildHistoricalTrends } from './queries/historicalTrendsReport';
import { buildExecutiveExport, type ExecutiveExportPayload } from './executiveExport';
import { summarizeForecastAccuracy } from './forecastAccuracy';
import { computeHealthScore } from './healthScore';

// ─── Re-exports de compatibilidade — consumidos fora deste arquivo (ver cabeçalho) ───────────────
export { currentPeriod } from './shared/period';
export {
  classifyCoverageProtection,
  COVERAGE_PROTECTION_FALLBACK_HEALTHY,
  COVERAGE_PROTECTION_FALLBACK_WARNING,
} from './coverageProtection';

export class CommercialIntelligenceUseCases {
  constructor(private repository: CommercialIntelligenceRepository) {}

  // ─── Metas ──────────────────────────────────────────────────────────────
  async getGoal(
    organizationId: string,
    period: string,
    metric: GoalMetric = 'NEW_MRR',
  ): Promise<CommercialGoalDTO | null> {
    return getGoalCommand(this.repository, organizationId, period, metric);
  }

  async setGoal(
    organizationId: string,
    period: string,
    amount: number,
    createdBy: string,
    currency = 'BRL',
    metric: GoalMetric = 'NEW_MRR',
  ): Promise<CommercialGoalDTO> {
    return setGoalCommand(
      this.repository,
      organizationId,
      period,
      amount,
      createdBy,
      currency,
      metric,
    );
  }

  // ─── Cockpit executivo (Fase 2 + 3) ─────────────────────────────────────
  async executiveOverview(
    organizationId: string,
    filter: CommercialIntelligenceFilter,
    now = new Date(),
  ): Promise<ExecutiveOverview> {
    return buildExecutiveOverview(this.repository, organizationId, filter, now);
  }

  // ─── Pipeline criado (Fase 3) ────────────────────────────────────────────
  async pipelineCreation(
    organizationId: string,
    filter: CommercialIntelligenceFilter,
    now = new Date(),
  ): Promise<PipelineCreation> {
    return buildPipelineCreation(this.repository, organizationId, filter, now);
  }

  // ─── Eficiência (Fase 4) ─────────────────────────────────────────────────
  async performance(
    organizationId: string,
    filter: CommercialIntelligenceFilter,
    now = new Date(),
  ): Promise<PerformanceMetrics> {
    return buildPerformance(this.repository, organizationId, filter, now);
  }

  // ─── Aging (Fase 5) ──────────────────────────────────────────────────────
  async aging(
    organizationId: string,
    filter: CommercialIntelligenceFilter,
    now = new Date(),
  ): Promise<AgingReport> {
    return buildAging(this.repository, organizationId, filter, now);
  }

  // ─── Motivos de perda (Fase 7) ───────────────────────────────────────────
  async losses(
    organizationId: string,
    filter: CommercialIntelligenceFilter,
    now = new Date(),
  ): Promise<LossAnalysis> {
    return buildLosses(this.repository, organizationId, filter, now);
  }

  // ─── Leading Indicators (Fase 5/6) ───────────────────────────────────────
  async leadingIndicators(
    organizationId: string,
    now = new Date(),
  ): Promise<LeadingIndicatorsReport> {
    return buildLeadingIndicators(this.repository, organizationId, now);
  }

  // ─── Alertas executivos (Fase 6) ─────────────────────────────────────────
  async alerts(
    organizationId: string,
    filter: CommercialIntelligenceFilter,
    now = new Date(),
  ): Promise<ExecutiveAlert[]> {
    return buildAlerts(this.repository, organizationId, filter, now);
  }

  // ─── Qualidade do CRM (Fase 7) ───────────────────────────────────────────
  async crmQuality(
    organizationId: string,
    filter: CommercialIntelligenceFilter,
    now = new Date(),
  ): Promise<CrmQualityIndex> {
    return buildCrmQuality(this.repository, organizationId, filter, now);
  }

  // ─── Drill-down (seção 29) ────────────────────────────────────────────────
  async dealsDrillDown(
    organizationId: string,
    query: DealDrillDownQuery,
    now = new Date(),
  ): Promise<DealDrillDownResult> {
    return buildDealsDrillDown(this.repository, organizationId, query, now);
  }

  async forecastExplain(
    organizationId: string,
    leadId: string,
    now = new Date(),
  ): Promise<ForecastExplain | null> {
    return buildForecastExplain(this.repository, organizationId, leadId, now);
  }

  // ─── Exportações (HTML/CSV/JSON/Relatório Executivo) ────────────────────
  //
  // "Proteção de Receita M/M+1/M+2/M+3" (revenueProtection()) foi avaliada nesta integração e
  // descartada — já existe como ExecutiveOverview.coverageProtection ("Proteção 90 dias"), mesmo
  // conceito. Decisão do dono do repositório: não duplicar com um segundo threshold de "atenção".
  /**
   * Reaproveita `executiveOverview`/`performance`/`pipelineCreation`/`alerts` (nenhum cálculo
   * novo aqui) e delega a serialização para `application/executiveExport.ts`.
   */
  async executiveExport(
    organizationId: string,
    filter: CommercialIntelligenceFilter,
    format: ExportFormat,
    now = new Date(),
  ): Promise<ExecutiveExportPayload> {
    const [overview, performance, creation, alertsList] = await Promise.all([
      this.executiveOverview(organizationId, filter, now),
      this.performance(organizationId, filter, now),
      this.pipelineCreation(organizationId, filter, now),
      this.alerts(organizationId, filter, now),
    ]);
    return buildExecutiveExport(format, overview, performance, creation, alertsList, now);
  }

  // ─── Opções de filtro reais (seção 18) ───────────────────────────────────
  async filterOptions(organizationId: string): Promise<FilterOptions> {
    return this.repository.getFilterOptions(organizationId);
  }

  // ─── Tendências históricas — 6 meses (seção 23) ───────────────────────────
  async historicalTrends(
    organizationId: string,
    filter: CommercialIntelligenceFilter,
    now = new Date(),
  ): Promise<HistoricalTrendsReport> {
    return buildHistoricalTrends(this.repository, organizationId, filter, now);
  }

  // ─── Health Score composto (Pipeline/Conversão/Produtividade/Qualidade de CRM/Follow-up/
  // Confiabilidade de Forecast) — gap de auditoria CPI, ver application/healthScore.ts.
  //
  // `forecastAccuracy` é um parâmetro explícito (não buscado por esta fachada) porque a
  // persistência do snapshot semanal (application/forecastSnapshot.ts) ainda depende de handoff
  // de schema para o Agente 01 — sem tabela real ainda, não há histórico de snapshot para ler
  // aqui. Omitir o parâmetro é uma resposta válida e honesta hoje: o pilar "Confiabilidade de
  // Forecast" retorna "não disponível" em vez de um número fabricado, exatamente como os demais
  // pilares fazem quando faltam dados (ver `application/healthScore.ts`).
  async healthScore(
    organizationId: string,
    filter: CommercialIntelligenceFilter,
    now = new Date(),
    forecastAccuracy: ForecastAccuracySummary = summarizeForecastAccuracy([]),
  ): Promise<HealthScoreResult> {
    const [overview, performance, aging, leadingIndicators, crmQuality] = await Promise.all([
      this.executiveOverview(organizationId, filter, now),
      this.performance(organizationId, filter, now),
      this.aging(organizationId, filter, now),
      this.leadingIndicators(organizationId, now),
      this.crmQuality(organizationId, filter, now),
    ]);
    return computeHealthScore(
      { overview, performance, aging, leadingIndicators, crmQuality, forecastAccuracy },
      now,
    );
  }
}
