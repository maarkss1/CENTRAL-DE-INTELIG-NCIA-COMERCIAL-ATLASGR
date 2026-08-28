/**
 * Cálculo de Account Score (dimensões fit/timing/intent/relationship) e decisão de Next Best
 * Action para o LDR (Account Intelligence). Funções puras, sem I/O — quem persiste (ver
 * `src/features/market-intelligence/jobs/accountIntelligenceInsights.worker.ts`) só grava o que
 * sai daqui, nunca um literal numérico direto (o guard `scripts/security/check-ldr-integrity.mjs`
 * bloqueia dimensão hardcoded em `accountScore.create/upsert/update`).
 *
 * v1: heurística deliberadamente simples, fundamentada só em dado real já persistido (nenhuma
 * chamada a IA, nenhum valor fabricado). `timing`/`intent`/`relationship` ficam em 0 (não
 * fabricado — literalmente "nenhuma contribuição contabilizada ainda") quando não há sinal/decisor
 * real para sustentar o cálculo. Pesos e limiares aqui são um ponto de partida documentado, não um
 * modelo validado com o time comercial — versionado (`ACCOUNT_SCORE_VERSION`) de propósito para
 * poder evoluir sem quebrar histórico.
 */

export interface AccountScoreSignalInput {
  type: string;
  detectedAt: Date;
}

export interface AccountScoreDecisionMakerInput {
  status: 'Active' | 'Inactive' | 'Unverified';
  confidence: number;
}

export interface AccountScoreInputs {
  lookalikeScore: number | null;
  activeSignals: AccountScoreSignalInput[];
  decisionMakers: AccountScoreDecisionMakerInput[];
}

export interface AccountScoreComponents {
  fit: number;
  timing: number;
  intent: number;
  relationship: number;
  total: number;
  positiveReasons: string[];
  negativeReasons: string[];
  calculation: {
    scoreVersion: string;
    fit: { value: number; reason: string };
    timing: { value: number; reason: string };
    intent: { value: number; reason: string };
    relationship: { value: number; reason: string };
  };
}

export const ACCOUNT_SCORE_VERSION = 'ldr-account-score.v1';

function clamp0to100(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function computeFit(lookalikeScore: number | null): {
  value: number;
  reason: string;
  positive: boolean;
} {
  if (lookalikeScore === null) {
    return {
      value: 0,
      reason: 'Sem score de similaridade a clientes ganhos (lookalike) calculado ainda.',
      positive: false,
    };
  }
  const value = clamp0to100(lookalikeScore);
  return {
    value,
    reason: `Similaridade a clientes ganhos (lookalike score) de ${value}/100.`,
    positive: value >= 30,
  };
}

const TIMING_FRESH_DAYS = 7;
const TIMING_RECENT_DAYS = 30;
const TIMING_STALE_DAYS = 90;

function computeTiming(
  activeSignals: AccountScoreSignalInput[],
  now: Date,
): { value: number; reason: string; positive: boolean } {
  if (activeSignals.length === 0) {
    return {
      value: 0,
      reason: 'Nenhum sinal ativo registrado — sem indicativo de timing.',
      positive: false,
    };
  }
  const mostRecentAt = activeSignals.reduce(
    (latest, signal) => (signal.detectedAt > latest ? signal.detectedAt : latest),
    activeSignals[0].detectedAt,
  );
  const daysSince = Math.max(
    0,
    Math.floor((now.getTime() - mostRecentAt.getTime()) / (24 * 60 * 60 * 1000)),
  );
  let value: number;
  if (daysSince <= TIMING_FRESH_DAYS) value = 100;
  else if (daysSince <= TIMING_RECENT_DAYS) value = 70;
  else if (daysSince <= TIMING_STALE_DAYS) value = 40;
  else value = 15;
  return {
    value,
    reason: `Sinal ativo mais recente detectado há ${daysSince} dia(s).`,
    positive: daysSince <= TIMING_RECENT_DAYS,
  };
}

function computeIntent(activeSignals: AccountScoreSignalInput[]): {
  value: number;
  reason: string;
  positive: boolean;
} {
  const distinctTypes = new Set(activeSignals.map((signal) => signal.type)).size;
  if (distinctTypes === 0) {
    return { value: 0, reason: 'Nenhum tipo de sinal ativo observado.', positive: false };
  }
  const value = Math.min(100, distinctTypes * 35);
  return {
    value,
    reason: `${distinctTypes} tipo(s) distinto(s) de sinal ativo observado(s).`,
    positive: distinctTypes >= 2,
  };
}

function computeRelationship(decisionMakers: AccountScoreDecisionMakerInput[]): {
  value: number;
  reason: string;
  positive: boolean;
} {
  const active = decisionMakers.filter((decisionMaker) => decisionMaker.status === 'Active');
  if (active.length === 0) {
    return { value: 0, reason: 'Nenhum decisor ativo identificado.', positive: false };
  }
  const averageConfidence = active.reduce((sum, dm) => sum + dm.confidence, 0) / active.length;
  const countFactor = Math.min(1, active.length / 3);
  const value = clamp0to100(averageConfidence * 100 * (0.5 + 0.5 * countFactor));
  return {
    value,
    reason: `${active.length} decisor(es) ativo(s) com confiança média de ${Math.round(averageConfidence * 100)}%.`,
    positive: true,
  };
}

export function computeAccountScore(
  inputs: AccountScoreInputs,
  now: Date = new Date(),
): AccountScoreComponents {
  const fit = computeFit(inputs.lookalikeScore);
  const timing = computeTiming(inputs.activeSignals, now);
  const intent = computeIntent(inputs.activeSignals);
  const relationship = computeRelationship(inputs.decisionMakers);

  const dimensions = [
    { key: 'fit', ...fit },
    { key: 'timing', ...timing },
    { key: 'intent', ...intent },
    { key: 'relationship', ...relationship },
  ];
  const positiveReasons = dimensions.filter((d) => d.positive).map((d) => d.reason);
  const negativeReasons = dimensions.filter((d) => !d.positive).map((d) => d.reason);
  const total = Math.round((fit.value + timing.value + intent.value + relationship.value) / 4);

  return {
    fit: fit.value,
    timing: timing.value,
    intent: intent.value,
    relationship: relationship.value,
    total,
    positiveReasons,
    negativeReasons,
    calculation: {
      scoreVersion: ACCOUNT_SCORE_VERSION,
      fit: { value: fit.value, reason: fit.reason },
      timing: { value: timing.value, reason: timing.reason },
      intent: { value: intent.value, reason: intent.reason },
      relationship: { value: relationship.value, reason: relationship.reason },
    },
  };
}

/**
 * Next Best Action — só os 6 tipos abaixo têm critério real definido nesta v1. START_BDR_CADENCE
 * (distinção SDR vs. BDR) e REVIEW_WITH_CLOSER (handoff por estágio de oportunidade) exigem dado
 * que este pipeline ainda não recebe (ver Fase 0 audit, seção D) — melhor não gerar do que inventar
 * o critério. Ambos ficam reservados no enum para quando essa entrada existir.
 */
export type NextBestActionType =
  | 'RESEARCH_MORE'
  | 'CREATE_BITRIX_TASK'
  | 'START_SDR_CADENCE'
  | 'START_BDR_CADENCE'
  | 'CONTACT_DECISION_MAKER'
  | 'REVIEW_WITH_CLOSER'
  | 'WAIT_AND_MONITOR'
  | 'DISQUALIFY';

export interface NextBestActionInputs {
  fit: number;
  hasLookalikeScore: boolean;
  activeSignalCount: number;
  activeDecisionMakerCount: number;
}

export interface NextBestActionDecision {
  actionType: NextBestActionType;
  title: string;
  rationale: string;
  priority: number;
  expectedImpact: string;
}

const DISQUALIFY_FIT_THRESHOLD = 20;
const PROACTIVE_FIT_THRESHOLD = 50;

export function decideNextBestAction(inputs: NextBestActionInputs): NextBestActionDecision {
  const { fit, hasLookalikeScore, activeSignalCount, activeDecisionMakerCount } = inputs;

  if (!hasLookalikeScore && activeSignalCount === 0 && activeDecisionMakerCount === 0) {
    return {
      actionType: 'RESEARCH_MORE',
      title: 'Pesquisar mais sobre a conta',
      rationale:
        'Não há score de fit, sinal ativo nem decisor identificado — evidência insuficiente para qualquer outra ação.',
      priority: 3,
      expectedImpact: 'Estabelecer uma base factual mínima antes de qualquer abordagem.',
    };
  }

  if (
    hasLookalikeScore &&
    fit < DISQUALIFY_FIT_THRESHOLD &&
    activeSignalCount === 0 &&
    activeDecisionMakerCount === 0
  ) {
    return {
      actionType: 'DISQUALIFY',
      title: 'Desqualificar por baixa aderência e ausência de engajamento',
      rationale: `Fit muito baixo (${fit}/100) e nenhum sinal ou decisor ativo identificado.`,
      priority: 4,
      expectedImpact:
        'Evitar investir esforço comercial numa conta com baixa probabilidade de conversão.',
    };
  }

  if (activeDecisionMakerCount > 0 && activeSignalCount > 0) {
    return {
      actionType: 'CREATE_BITRIX_TASK',
      title: 'Criar tarefa de abordagem no Bitrix',
      rationale: `${activeDecisionMakerCount} decisor(es) ativo(s) e ${activeSignalCount} sinal(is) ativo(s) — momento oportuno para contato direto.`,
      priority: 1,
      expectedImpact: 'Converter sinal e decisor identificado em contato comercial rastreável.',
    };
  }

  if (activeDecisionMakerCount > 0) {
    return {
      actionType: 'CONTACT_DECISION_MAKER',
      title: 'Contatar decisor identificado',
      rationale: `${activeDecisionMakerCount} decisor(es) ativo(s) identificado(s), sem sinal recente de timing.`,
      priority: 2,
      expectedImpact: 'Iniciar relacionamento direto com quem decide.',
    };
  }

  if (activeSignalCount > 0) {
    return {
      actionType: 'START_SDR_CADENCE',
      title: 'Iniciar cadência de SDR',
      rationale: `${activeSignalCount} sinal(is) ativo(s) sem decisor identificado ainda — qualificar via cadência.`,
      priority: 2,
      expectedImpact: 'Qualificar a conta e identificar decisor por meio de cadência estruturada.',
    };
  }

  if (fit >= PROACTIVE_FIT_THRESHOLD) {
    return {
      actionType: 'START_SDR_CADENCE',
      title: 'Iniciar cadência de SDR por fit',
      rationale: `Fit alto (${fit}/100) mesmo sem sinal ativo — prospecção proativa recomendada.`,
      priority: 3,
      expectedImpact: 'Antecipar prospecção numa conta com alta similaridade a clientes ganhos.',
    };
  }

  return {
    actionType: 'WAIT_AND_MONITOR',
    title: 'Aguardar e monitorar',
    rationale: `Fit ${fit}/100, sem sinal ativo nem decisor identificado — não há gatilho suficiente para agir agora.`,
    priority: 5,
    expectedImpact: 'Evitar esforço prematuro; recalcular quando surgir novo sinal.',
  };
}
