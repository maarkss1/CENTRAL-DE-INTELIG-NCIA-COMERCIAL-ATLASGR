/**
 * Confiabilidade dos Dados / Data Readiness Score (seção 5 do prompt de produto) — mede a
 * qualidade dos campos que alimentam o Forecast, com peso por impacto real no cálculo (não uma
 * média simples de completude — um campo com alto impacto no forecast pesa mais que um campo
 * secundário). Também alimenta o Forecast Confidence (seção 22).
 *
 * Pesos e limiares são POLÍTICA documentada, não dado fabricado — mesmo espírito de
 * `STAGE_AGING_CRITICAL_DAYS` em `pipelineEligibility.ts`. Nunca produz uma confiança artificial:
 * campo com população vazia (`total === 0`) fica de fora da média ponderada em vez de contar como
 * 0% ou 100%.
 */

import type { DealRow } from '../domain/CommercialIntelligence';

export type ReadinessClassification = 'saudavel' | 'atencao' | 'critico';

/** Testes de preenchimento por campo, compartilhados entre `dataReadiness`/`forecastConfidence` — `stageHistory` é tratado à parte (depende de `LeadStageHistory`, não é um campo de `DealRow`). */
export const DEAL_FIELD_TESTS: Record<string, (d: DealRow) => boolean> = {
    amount: (d) => d.amount > 0,
    owner: (d) => !!d.owner,
    pipelineStageId: (d) => !!d.pipelineStageId,
    expectedCloseAt: (d) => !!d.expectedCloseAt,
    nextAction: (d) => !!d.nextAction,
    lastInteraction: (d) => !!d.lastInteraction,
    source: (d) => !!d.source,
    productSkus: (d) => d.productSkus.length > 0,
    icp: (d) => !!d.icp,
    lossReason: (d) => !!d.lossReason,
};

/** Mesmos limiares (≥80 / ≥50) já usados na UI de Qualidade do CRM antes desta evolução — mantidos por consistência, não redefinidos arbitrariamente. */
export function classifyCompleteness(pct: number | null): ReadinessClassification | null {
    if (pct == null) return null;
    if (pct >= 80) return 'saudavel';
    if (pct >= 50) return 'atencao';
    return 'critico';
}

export interface ReadinessFieldWeight {
    field: string;
    label: string;
    /** Peso relativo (não precisa somar 100 — a média ponderada normaliza pelo somatório dos pesos avaliados). */
    weight: number;
    /** Classificação textual do impacto no forecast, exibida na UI (seção 5: "impacto do campo no Forecast"). */
    forecastImpact: 'alto' | 'medio' | 'baixo';
}

/**
 * Pesos dos campos listados na seção 5 do prompt de produto, avaliados sobre negócios ABERTOS do
 * funil Negócio (mesma população de `crmQuality`). "Motivo da perda" é avaliado separadamente
 * sobre negócios PERDIDOS do período (ver `CommercialIntelligenceUseCases.crmQuality`), porque não
 * existe em negócios abertos.
 */
export const DATA_READINESS_OPEN_FIELD_WEIGHTS: ReadinessFieldWeight[] = [
    { field: 'amount', label: 'Valor/MRR', weight: 15, forecastImpact: 'alto' },
    { field: 'owner', label: 'Responsável', weight: 15, forecastImpact: 'alto' },
    { field: 'pipelineStageId', label: 'Etapa', weight: 10, forecastImpact: 'alto' },
    { field: 'expectedCloseAt', label: 'Data prevista de fechamento', weight: 15, forecastImpact: 'alto' },
    { field: 'nextAction', label: 'Próxima atividade', weight: 15, forecastImpact: 'alto' },
    { field: 'lastInteraction', label: 'Última interação', weight: 10, forecastImpact: 'medio' },
    { field: 'source', label: 'Origem', weight: 8, forecastImpact: 'medio' },
    { field: 'productSkus', label: 'Produto', weight: 6, forecastImpact: 'baixo' },
    { field: 'icp', label: 'ICP/Segmento', weight: 6, forecastImpact: 'baixo' },
    { field: 'stageHistory', label: 'Histórico de etapa', weight: 10, forecastImpact: 'medio' },
];

export const DATA_READINESS_LOSS_FIELD_WEIGHT: ReadinessFieldWeight = {
    field: 'lossReason', label: 'Motivo da perda', weight: 10, forecastImpact: 'medio',
};

/** Subconjunto de campos usados pelo Forecast Confidence (seção 22) — só os que o motor de forecast (`forecastEngine.ts`) realmente lê como sinal. */
export const FORECAST_CONFIDENCE_FIELDS = new Set(['amount', 'owner', 'expectedCloseAt', 'nextAction', 'lastInteraction']);

export interface WeightedInput {
    weight: number;
    completeness: number | null;
}

/** Média ponderada, ignorando entradas sem população avaliável (completeness null). `null` se nada for avaliável. */
export function weightedCompletenessScore(inputs: WeightedInput[]): number | null {
    const usable = inputs.filter((i) => i.completeness != null && i.weight > 0);
    if (usable.length === 0) return null;
    const totalWeight = usable.reduce((sum, i) => sum + i.weight, 0);
    const weightedSum = usable.reduce((sum, i) => sum + (i.completeness as number) * i.weight, 0);
    return Math.round((weightedSum / totalWeight) * 100) / 100;
}
