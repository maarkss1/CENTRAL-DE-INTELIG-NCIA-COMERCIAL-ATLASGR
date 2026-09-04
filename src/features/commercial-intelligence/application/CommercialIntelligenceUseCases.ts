/**
 * Fachada pública do módulo "Comercial Inteligente" (Revenue Command Center executivo).
 *
 * Esta classe NÃO contém mais lógica de negócio própria — ela só implementa a API pública estável
 * consumida por `CommercialIntelligenceController` e `CommercialIntelligenceAiService`, delegando
 * cada método a um módulo coeso de `application/`:
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
  ForecastSnapshotStore,
} from '../domain/CommercialIntelligence';
import type { CloseDateIntelligenceReport, JourneyReport } from '../domain/JourneyIntelligence';
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
import { buildForecastAccuracy } from './queries/forecastAccuracyReport';
import { buildCloseDateIntelligence } from './queries/closeDateIntelligenceReport';
import { buildJourney } from './queries/journeyReport';
import { buildExecutiveExport, type ExecutiveExportPayload } from './executiveExport';
import { computeHealthScore } from './healthScore';

// ─── Re-exports de compatibilidade — consumidos fora deste arquivo (ver cabeçalho) ───────────────
export { currentPeriod } from './shared/period';
export {
  classifyCoverageProtection,
  COVERAGE_PROTECTION_FALLBACK_HEALTHY,
  COVERAGE_PROTECTION_FALLBACK_WARNING,
} from './coverageProtection';

export class CommercialIntelligenceUseCases {
  /**
   * `snapshotStore` é opcional só para preservar os consumidores existentes (testes, serviços
   * que nunca precisam de erro histórico). Em produção (`shared/di/setup.ts`) é sempre o
   * `PrismaForecastSnapshotStore` real — sem ele, `forecastAccuracy()`/o pilar "Confiabilidade
   * de Forecast" respondem "sem histórico suficiente" de forma honesta, nunca um número.
   */
  constructor(
    private repository: CommercialIntelligenceRepository,
    private snapshotStore: ForecastSnapshotStore | null = null,
  ) {}

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

  // ─── Erro histórico do Forecast (previsto vs. realizado) ─────────────────
  //
  // Lê os snapshots REAIS gravados pelo job semanal (`jobs/forecastSnapshotWeekly.worker.ts`,
  // model `ForecastSnapshot`) e compara o snapshot mais antigo de cada mês já encerrado com o
  // Fechado realizado daquele mês. Sem store injetado, sem snapshot ou sem período encerrado,
  // devolve `available: false` com o motivo — nunca um erro fabricado.
  async forecastAccuracy(
    organizationId: string,
    now = new Date(),
  ): Promise<ForecastAccuracySummary> {
    return buildForecastAccuracy(this.repository, this.snapshotStore, organizationId, now);
  }

  // ─── Health Score composto (Pipeline/Conversão/Produtividade/Qualidade de CRM/Follow-up/
  // Confiabilidade de Forecast) — ver application/healthScore.ts.
  //
  // `forecastAccuracy` pode ser injetado explicitamente (testes/backtest de uma amostra
  // específica); omitido, é calculado a partir dos snapshots reais via `forecastAccuracy()`.
  // Sem histórico, o pilar "Confiabilidade de Forecast" retorna "não disponível" em vez de um
  // número fabricado, exatamente como os demais pilares fazem quando faltam dados.
  async healthScore(
    organizationId: string,
    filter: CommercialIntelligenceFilter,
    now = new Date(),
    forecastAccuracy?: ForecastAccuracySummary,
  ): Promise<HealthScoreResult> {
    const [overview, performance, aging, leadingIndicators, crmQuality, accuracy] =
      await Promise.all([
        this.executiveOverview(organizationId, filter, now),
        this.performance(organizationId, filter, now),
        this.aging(organizationId, filter, now),
        this.leadingIndicators(organizationId, now),
        this.crmQuality(organizationId, filter, now),
        forecastAccuracy
          ? Promise.resolve(forecastAccuracy)
          : this.forecastAccuracy(organizationId, now),
      ]);
    return computeHealthScore(
      { overview, performance, aging, leadingIndicators, crmQuality, forecastAccuracy: accuracy },
      now,
    );
  }

  // ─── CLOSEDATE Intelligence (adiamentos/antecipações da data prevista) ────
  async closeDateIntelligence(
    organizationId: string,
    filter: CommercialIntelligenceFilter,
    now = new Date(),
  ): Promise<CloseDateIntelligenceReport> {
    return buildCloseDateIntelligence(this.repository, organizationId, filter, now);
  }

  // ─── Jornada (handoffs, reentradas, sem interação, mapa de transições) ─────
  async journey(
    organizationId: string,
    filter: CommercialIntelligenceFilter,
    now = new Date(),
  ): Promise<JourneyReport> {
    return buildJourney(this.repository, organizationId, filter, now);
  }
}
