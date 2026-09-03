/**
 * Fórmula do Deal Health Score derivado de CONVERSA (Onda 5) — deliberadamente determinística, não
 * pedida à IA: a extração de sinais (`conversationIntelligence.service.ts`) usa IA, mas combinar
 * esses sinais num score de 0-100 é aritmética simples e auditável, documentada aqui (mesmo
 * princípio de `metricsDictionary.ts` em commercial-intelligence — "toda métrica precisa de
 * fórmula reproduzível"). Não confundir com o Health Score de `commercial-intelligence/application/
 * healthScore.ts`, que é sobre COBERTURA DE PIPELINE/qualidade de dado do funil inteiro — este é
 * por OPORTUNIDADE individual, informado pelo conteúdo real de uma conversa específica.
 */
export type SentimentScore = 'Muito Positivo' | 'Positivo' | 'Neutro / Cauteloso' | 'Negativo';

export interface DealHealthScoreInput {
  sentimentScore: SentimentScore | null;
  unresolvedObjectionsCount: number;
  buyingSignalsCount: number;
  competitorMentionsCount: number;
}

export interface DealHealthScoreFactors {
  sentimentBase: number;
  objectionPenalty: number;
  buyingSignalBonus: number;
  competitorPenalty: number;
}

export interface DealHealthScoreResult {
  score: number;
  factors: DealHealthScoreFactors;
}

/** Ponto de partida por sentimento da conversa — `null`/desconhecido fica no meio (nem otimista
 * nem pessimista), nunca 0 fabricado. */
const SENTIMENT_BASE: Record<SentimentScore, number> = {
  'Muito Positivo': 90,
  Positivo: 70,
  'Neutro / Cauteloso': 50,
  Negativo: 25,
};

/** -8 por objeção NÃO resolvida (objeção resolvida na própria conversa não penaliza), teto -30 —
 * várias objeções pendentes já são um sinal forte, mas uma única não deve derrubar o score sozinha. */
const OBJECTION_PENALTY_PER_ITEM = 8;
const OBJECTION_PENALTY_CAP = 30;

/** +5 por sinal de compra identificado, teto +20. */
const BUYING_SIGNAL_BONUS_PER_ITEM = 5;
const BUYING_SIGNAL_BONUS_CAP = 20;

/** -5 por concorrente mencionado, teto -15 — mencionar um concorrente não é necessariamente ruim
 * (pode ser só contexto), por isso o peso é menor que o de uma objeção não resolvida. */
const COMPETITOR_PENALTY_PER_ITEM = 5;
const COMPETITOR_PENALTY_CAP = 15;

export function computeDealHealthScore(input: DealHealthScoreInput): DealHealthScoreResult {
  const sentimentBase = input.sentimentScore ? SENTIMENT_BASE[input.sentimentScore] : 50;
  const objectionPenalty = Math.min(
    OBJECTION_PENALTY_CAP,
    Math.max(0, input.unresolvedObjectionsCount) * OBJECTION_PENALTY_PER_ITEM,
  );
  const buyingSignalBonus = Math.min(
    BUYING_SIGNAL_BONUS_CAP,
    Math.max(0, input.buyingSignalsCount) * BUYING_SIGNAL_BONUS_PER_ITEM,
  );
  const competitorPenalty = Math.min(
    COMPETITOR_PENALTY_CAP,
    Math.max(0, input.competitorMentionsCount) * COMPETITOR_PENALTY_PER_ITEM,
  );

  const rawScore = sentimentBase - objectionPenalty + buyingSignalBonus - competitorPenalty;
  const score = Math.round(Math.max(0, Math.min(100, rawScore)));

  return {
    score,
    factors: { sentimentBase, objectionPenalty, buyingSignalBonus, competitorPenalty },
  };
}

// ─── Customer Success / Churn (Onda 6) ─────────────────────────────────────
// Mesmo princípio do Deal Health Score acima — score determinístico e documentado sobre sinais já
// extraídos por IA (`conversationIntelligence.service.ts`), não "a IA decide o risco". Conceito
// DISTINTO de Deal Health: aqui é sobre risco de insatisfação/perda de um cliente já fechado
// (pós-venda), não sobre a chance de fechar uma oportunidade em aberto.

export interface ChurnRiskScoreInput {
  sentimentScore: SentimentScore | null;
  complaintsCount: number;
  /** Reclamações de severidade "alta" pesam mais que a contagem simples — contadas à parte. */
  highSeverityComplaintsCount: number;
  blockersCount: number;
}

export interface ChurnRiskScoreFactors {
  sentimentBase: number;
  complaintPenalty: number;
  highSeverityComplaintPenalty: number;
  blockerPenalty: number;
}

export interface ChurnRiskScoreResult {
  score: number;
  factors: ChurnRiskScoreFactors;
}

/** -6 por reclamação, teto -20. */
const COMPLAINT_PENALTY_PER_ITEM = 6;
const COMPLAINT_PENALTY_CAP = 20;

/** -12 adicionais por reclamação de severidade alta (empilha com a penalidade geral acima), teto
 * -30 — uma única reclamação grave já deve puxar o score bastante pra baixo. */
const HIGH_SEVERITY_COMPLAINT_PENALTY_PER_ITEM = 12;
const HIGH_SEVERITY_COMPLAINT_PENALTY_CAP = 30;

/** -10 por bloqueio identificado (algo impedindo o cliente de usar/avançar), teto -25. */
const BLOCKER_PENALTY_PER_ITEM = 10;
const BLOCKER_PENALTY_CAP = 25;

export function computeChurnRiskScore(input: ChurnRiskScoreInput): ChurnRiskScoreResult {
  const sentimentBase = input.sentimentScore ? SENTIMENT_BASE[input.sentimentScore] : 50;
  const complaintPenalty = Math.min(
    COMPLAINT_PENALTY_CAP,
    Math.max(0, input.complaintsCount) * COMPLAINT_PENALTY_PER_ITEM,
  );
  const highSeverityComplaintPenalty = Math.min(
    HIGH_SEVERITY_COMPLAINT_PENALTY_CAP,
    Math.max(0, input.highSeverityComplaintsCount) * HIGH_SEVERITY_COMPLAINT_PENALTY_PER_ITEM,
  );
  const blockerPenalty = Math.min(
    BLOCKER_PENALTY_CAP,
    Math.max(0, input.blockersCount) * BLOCKER_PENALTY_PER_ITEM,
  );

  const rawScore = sentimentBase - complaintPenalty - highSeverityComplaintPenalty - blockerPenalty;
  const score = Math.round(Math.max(0, Math.min(100, rawScore)));

  return {
    score,
    factors: { sentimentBase, complaintPenalty, highSeverityComplaintPenalty, blockerPenalty },
  };
}
