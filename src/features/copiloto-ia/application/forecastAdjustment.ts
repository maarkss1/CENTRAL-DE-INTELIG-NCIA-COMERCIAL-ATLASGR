/**
 * "Forecast IA complementar ao CRM" (Onda 6, AGENT_10 do pacote): NUNCA substitui
 * `Lead.probability` (a probabilidade oficial do CRM, dona de todo forecast de portfólio em
 * `commercial-intelligence/application/forecastEngine.ts`/`predictiveForecast.ts` — não
 * duplicados aqui). Esta função só produz um AJUSTE explicável, por oportunidade individual,
 * informado pelo Deal Health Score desta conversa (Onda 5) — determinística, documentada, nunca
 * "a IA inventa o número" (AGENT_10: "obrigatório explicar cada mudança material de
 * probabilidade" — por isso `reasons` é sempre preenchido, nunca um array vazio quando há ajuste).
 */
export interface ForecastAdjustmentInput {
  /** `Lead.probability` no momento do snapshot — `null` quando o CRM ainda não tem probabilidade
   * preenchida para este Lead (comum logo na criação). */
  crmProbability: number | null;
  /** Deal Health Score desta conversa (0-100, `dealHealthScoring.ts`). */
  dealHealthScore: number;
}

export interface ForecastAdjustmentResult {
  probabilityAi: number;
  reasons: string[];
}

/** Base quando o CRM não tem probabilidade preenchida — meio do caminho, nem otimista nem
 * pessimista, nunca 0/100 fabricado. */
const DEFAULT_CRM_PROBABILITY = 50;

/** Cada ponto de Health Score acima/abaixo do centro neutro (50) desloca a probabilidade em até
 * 0.3 pontos, com teto de ±15 — a conversa AJUSTA a leitura do CRM, nunca a domina por completo
 * (uma única conversa boa não deveria sozinha levar um negócio de 20% pra 80%). */
const HEALTH_DELTA_WEIGHT = 0.3;
const HEALTH_DELTA_CAP = 15;

export function computeAiProbabilityAdjustment(
  input: ForecastAdjustmentInput,
): ForecastAdjustmentResult {
  const base = input.crmProbability ?? DEFAULT_CRM_PROBABILITY;
  const healthDelta = input.dealHealthScore - 50;
  const adjustment = Math.max(
    -HEALTH_DELTA_CAP,
    Math.min(HEALTH_DELTA_CAP, healthDelta * HEALTH_DELTA_WEIGHT),
  );
  const probabilityAi = Math.round(Math.max(0, Math.min(100, base + adjustment)));

  const reasons: string[] = [];
  reasons.push(
    input.crmProbability != null
      ? `Ponto de partida: probabilidade do CRM (${input.crmProbability}%).`
      : 'Ponto de partida: 50% — Lead ainda sem probabilidade preenchida no CRM.',
  );
  if (Math.round(adjustment) > 0) {
    reasons.push(
      `+${Math.round(adjustment)}pp: Deal Health Score desta conversa (${input.dealHealthScore}/100) acima da média.`,
    );
  } else if (Math.round(adjustment) < 0) {
    reasons.push(
      `${Math.round(adjustment)}pp: Deal Health Score desta conversa (${input.dealHealthScore}/100) abaixo da média.`,
    );
  } else {
    reasons.push(
      `Sem ajuste: Deal Health Score desta conversa (${input.dealHealthScore}/100) na média.`,
    );
  }

  return { probabilityAi, reasons };
}
