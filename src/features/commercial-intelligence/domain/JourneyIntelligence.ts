/**
 * Tipos de domínio de CLOSEDATE Intelligence e da Jornada do cliente (handoffs, reentradas,
 * clientes sem interação, mapa de transições) — complemento de `CommercialIntelligence.ts`,
 * separado só para manter aquele arquivo abaixo do limite de hotspot. Mesmas regras: todo campo é
 * reproduzível a partir de `LeadFieldChange`/`LeadStageHistory`/`Lead` reais (ver
 * `application/metricsDictionary.ts`), e ausência de histórico é `trackingSince: null`, nunca dado
 * fabricado.
 */
import type { ForecastRulesVersion, ForecastTier, PeriodMonth } from './CommercialIntelligence';

// ─── CLOSEDATE Intelligence ─────────────────────────────────────────────────

export interface CloseDateDealRow {
  leadId: string;
  title: string | null;
  companyName: string | null;
  owner: string | null;
  amount: number;
  stageName: string | null;
  tier: ForecastTier;
  /** Primeira data prevista conhecida no histórico rastreado (previousValue da 1ª mudança) ou, sem histórico, a data atual. */
  originalCloseAt: string | null;
  currentCloseAt: string | null;
  slips: number;
  pullIns: number;
  /** Soma líquida de dias deslocados entre a data original e a atual (positivo = empurrada para frente). */
  netDaysShifted: number | null;
  lastChangedAt: string | null;
  /** `true` quando slips ≥ FORECAST_RULES.CLOSE_DATE_CHRONIC_SLIPS. */
  chronic: boolean;
}

export interface CloseDateBreakdown {
  label: string;
  dealsWithSlips: number;
  totalSlips: number;
  chronicDeals: number;
  amountAtRisk: number;
}

export interface CloseDateIntelligenceReport {
  period: PeriodMonth;
  /** Desde quando existe histórico real (primeira linha de LeadFieldChange desta organização); `null` sem nenhum registro. */
  trackingSince: string | null;
  openDealsEvaluated: number;
  dealsWithAnyChange: number;
  dealsWithSlips: number;
  totalSlips: number;
  totalPullIns: number;
  chronicDeals: number;
  /** Valor total dos negócios abertos com ≥1 adiamento. */
  amountWithSlips: number;
  averageDaysSlippedPerSlip: number | null;
  /** Negócios abertos cuja data prevista entrou no mês do filtro vindo de um mês ANTERIOR (adiadas para dentro do período). */
  slippedIntoPeriodCount: number;
  /** Negócios abertos cuja data prevista SAIU do mês do filtro para depois dele. */
  slippedOutOfPeriodCount: number;
  slippedOutOfPeriodAmount: number;
  byOwner: CloseDateBreakdown[];
  byProduct: CloseDateBreakdown[];
  byStage: CloseDateBreakdown[];
  /** Negócios abertos com ≥1 adiamento, ordenados por slips desc, depois valor desc. */
  deals: CloseDateDealRow[];
  rulesVersion: ForecastRulesVersion;
}

// ─── Jornada do cliente (handoffs, reentradas, sem interação, transições) ────

export interface HandoffRow {
  leadId: string;
  title: string | null;
  companyName: string | null;
  amount: number;
  fromOwner: string | null;
  toOwner: string | null;
  changedAt: string;
  source: string;
  isOpen: boolean;
}

export interface HandoffPairBreakdown {
  fromOwner: string | null;
  toOwner: string | null;
  count: number;
}

export interface HandoffsSummary {
  trackingSince: string | null;
  /** Trocas de responsável ocorridas DENTRO do mês do filtro. */
  countInPeriod: number;
  dealsWithHandoffInPeriod: number;
  /** Negócios abertos hoje com ≥2 trocas em todo o histórico (retrabalho de relacionamento). */
  openDealsWithMultipleHandoffs: number;
  byPair: HandoffPairBreakdown[];
  recent: HandoffRow[];
}

export interface ReentryRow {
  leadId: string;
  title: string | null;
  companyName: string | null;
  owner: string | null;
  amount: number;
  /** Etapa terminal da qual saiu (Ganho/Perdido/Cancelado) e etapa para onde voltou. */
  fromTerminalStage: string;
  toStage: string;
  reenteredAt: string;
  /** Situação atual do negócio depois da reentrada. */
  currentStatus: 'aberto' | 'ganho' | 'perdido';
}

export interface ReentriesSummary {
  trackingSince: string | null;
  countInPeriod: number;
  totalTracked: number;
  /** Reentradas que hoje estão em etapa ganha — "clientes recuperados". */
  recoveredCount: number;
  recoveredAmount: number;
  /** Reentradas ainda abertas — "reativados em andamento". */
  reactivatedOpenCount: number;
  reactivatedOpenAmount: number;
  rows: ReentryRow[];
}

export interface NoInteractionRow {
  leadId: string;
  title: string | null;
  companyName: string | null;
  owner: string | null;
  amount: number;
  stageName: string | null;
  /** Dias desde a última interação; `null` = nunca houve interação registrada. */
  daysSinceInteraction: number | null;
  tier: ForecastTier;
}

export interface NoInteractionSummary {
  /** Limiar em dias (FORECAST_RULES.STALE_INTERACTION_DAYS). */
  thresholdDays: number;
  openDealsEvaluated: number;
  /** Abertos sem interação há mais que o limiar OU sem nenhuma interação registrada. */
  count: number;
  amount: number;
  neverInteractedCount: number;
  rows: NoInteractionRow[];
}

export interface StageTransitionEdge {
  fromStage: string;
  toStage: string;
  count: number;
  /** Mediana de dias que o negócio ficou em `fromStage` antes desta transição. `null` sem amostra. */
  medianDaysInFrom: number | null;
  /** `true` quando a transição é para uma etapa de sortOrder MENOR (regressão no funil). */
  backward: boolean;
}

export interface StageTransitionsSummary {
  trackingSince: string | null;
  totalTransitions: number;
  backwardTransitions: number;
  edges: StageTransitionEdge[];
}

export interface JourneyReport {
  period: PeriodMonth;
  handoffs: HandoffsSummary;
  reentries: ReentriesSummary;
  noInteraction: NoInteractionSummary;
  transitions: StageTransitionsSummary;
}
