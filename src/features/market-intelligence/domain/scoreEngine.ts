import { clampScore, censusAllowsWhiteSpace, type CensusStatus } from './MarketIntelligence';

export interface ScoredValue {
    value: number | null;
    confidence: number;
}

export interface WhiteSpaceInputs {
    demand: ScoredValue;
    need: ScoredValue;
    logistics: ScoredValue;
    competitionPressure: ScoredValue;
    censusStatus: CensusStatus;
}

export interface OpportunityInputs {
    icp: ScoredValue;
    rntrc: ScoredValue;
    mdfe: ScoredValue;
    need: ScoredValue;
    whiteSpace: ScoredValue;
    territorialEfficiency: ScoredValue;
}

export interface OpportunityWeights {
    icp: number;
    rntrc: number;
    mdfe: number;
    need: number;
    whiteSpace: number;
    territorialEfficiency: number;
}

export interface OpportunityResult {
    raw: number | null;
    adjusted: number | null;
    aggregateConfidence: number;
    blockedReasons: string[];
}

export interface SensitivityRow {
    id: string;
    inputs: OpportunityInputs;
}

export interface SensitivityResult {
    id: string;
    baseScore: number;
    baseRank: number;
    minRank: number;
    maxRank: number;
    meanRank: number;
    rankStdDev: number;
    scenarios: number;
    stability: 'ALTA' | 'MEDIA' | 'BAIXA';
}

export const BASE_OPPORTUNITY_WEIGHTS: OpportunityWeights = {
    icp: 0.25,
    rntrc: 0.20,
    mdfe: 0.15,
    need: 0.15,
    whiteSpace: 0.20,
    territorialEfficiency: 0.05,
};

const WHITE_SPACE_EXPONENTS = {
    demand: 0.35,
    need: 0.20,
    logistics: 0.25,
    lowCompetition: 0.20,
};

function validScore(value: number | null): value is number {
    return value !== null && Number.isFinite(value) && value >= 0 && value <= 100;
}

function validConfidence(value: number): boolean {
    return Number.isFinite(value) && value >= 0 && value <= 1;
}

function geometricConfidence(values: Array<{ confidence: number; weight: number }>): number {
    const active = values.filter((item) => item.weight > 0);
    if (!active.length) return 0;
    const totalWeight = active.reduce((sum, item) => sum + item.weight, 0);
    if (!totalWeight) return 0;
    if (active.some((item) => !validConfidence(item.confidence) || item.confidence <= 0)) return 0;
    const logMean = active.reduce((sum, item) => sum + (item.weight / totalWeight) * Math.log(item.confidence), 0);
    return Math.exp(logMean);
}

export function calculateWhiteSpace(inputs: WhiteSpaceInputs): ScoredValue & { blockedReason?: string } {
    if (!censusAllowsWhiteSpace(inputs.censusStatus)) {
        return {
            value: null,
            confidence: 0,
            blockedReason: `White Space bloqueado: concorrência está em ${inputs.censusStatus}`,
        };
    }

    const components = [inputs.demand, inputs.need, inputs.logistics, inputs.competitionPressure];
    if (components.some((item) => !validScore(item.value))) {
        return { value: null, confidence: 0, blockedReason: 'White Space bloqueado: componente obrigatório ausente ou inválido' };
    }

    const demand = inputs.demand.value! / 100;
    const need = inputs.need.value! / 100;
    const logistics = inputs.logistics.value! / 100;
    const lowCompetition = Math.max(0, 1 - inputs.competitionPressure.value! / 100);

    // Média geométrica ponderada: um mercado saturado não vence apenas por ser grande.
    const raw = 100
        * Math.pow(demand, WHITE_SPACE_EXPONENTS.demand)
        * Math.pow(need, WHITE_SPACE_EXPONENTS.need)
        * Math.pow(logistics, WHITE_SPACE_EXPONENTS.logistics)
        * Math.pow(lowCompetition, WHITE_SPACE_EXPONENTS.lowCompetition);

    const confidence = geometricConfidence([
        { confidence: inputs.demand.confidence, weight: WHITE_SPACE_EXPONENTS.demand },
        { confidence: inputs.need.confidence, weight: WHITE_SPACE_EXPONENTS.need },
        { confidence: inputs.logistics.confidence, weight: WHITE_SPACE_EXPONENTS.logistics },
        { confidence: inputs.competitionPressure.confidence, weight: WHITE_SPACE_EXPONENTS.lowCompetition },
    ]);

    return { value: clampScore(raw), confidence };
}

export function normalizeWeights(weights: OpportunityWeights): OpportunityWeights {
    const keys = Object.keys(weights) as Array<keyof OpportunityWeights>;
    const sanitized = Object.fromEntries(keys.map((key) => [key, Math.max(0, Number(weights[key]) || 0)])) as unknown as OpportunityWeights;
    const total = keys.reduce((sum, key) => sum + sanitized[key], 0);
    if (total <= 0) throw new Error('Opportunity Score exige pelo menos um peso positivo.');
    return Object.fromEntries(keys.map((key) => [key, sanitized[key] / total])) as unknown as OpportunityWeights;
}

export function calculateOpportunityScore(
    inputs: OpportunityInputs,
    requestedWeights: OpportunityWeights = BASE_OPPORTUNITY_WEIGHTS,
): OpportunityResult {
    const weights = normalizeWeights(requestedWeights);
    const keys = Object.keys(weights) as Array<keyof OpportunityWeights>;
    const blockedReasons: string[] = [];

    for (const key of keys) {
        if (weights[key] <= 0) continue;
        const component = inputs[key];
        if (!validScore(component.value)) blockedReasons.push(`${key}: NÃO DISPONÍVEL ou fora de 0-100`);
        if (!validConfidence(component.confidence)) blockedReasons.push(`${key}: confiança inválida`);
    }

    if (blockedReasons.length) return { raw: null, adjusted: null, aggregateConfidence: 0, blockedReasons };

    const raw = keys.reduce((sum, key) => sum + inputs[key].value! * weights[key], 0);
    const aggregateConfidence = geometricConfidence(keys.map((key) => ({ confidence: inputs[key].confidence, weight: weights[key] })));
    return {
        raw: clampScore(raw),
        adjusted: clampScore(raw * aggregateConfidence),
        aggregateConfidence,
        blockedReasons,
    };
}

function perturbWeight(base: OpportunityWeights, key: keyof OpportunityWeights, delta: number): OpportunityWeights {
    const next = { ...base, [key]: Math.max(0, base[key] + delta) };
    return normalizeWeights(next);
}

function rankScores(rows: SensitivityRow[], weights: OpportunityWeights): Map<string, { rank: number; score: number }> {
    const scored = rows
        .map((row) => ({ id: row.id, score: calculateOpportunityScore(row.inputs, weights).adjusted }))
        .filter((row): row is { id: string; score: number } => row.score !== null)
        .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    return new Map(scored.map((row, index) => [row.id, { rank: index + 1, score: row.score }]));
}

export function analyzeWeightSensitivity(
    rows: SensitivityRow[],
    baseWeights: OpportunityWeights = BASE_OPPORTUNITY_WEIGHTS,
    delta = 0.05,
): SensitivityResult[] {
    const normalizedBase = normalizeWeights(baseWeights);
    const keys = Object.keys(normalizedBase) as Array<keyof OpportunityWeights>;
    const scenarios = [normalizedBase];
    for (const key of keys) {
        scenarios.push(perturbWeight(normalizedBase, key, delta));
        scenarios.push(perturbWeight(normalizedBase, key, -delta));
    }

    const rankings = scenarios.map((weights) => rankScores(rows, weights));
    const baseRanking = rankings[0];
    const result: SensitivityResult[] = [];

    for (const row of rows) {
        const base = baseRanking.get(row.id);
        if (!base) continue;
        const ranks = rankings.map((ranking) => ranking.get(row.id)?.rank).filter((rank): rank is number => rank !== undefined);
        const meanRank = ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length;
        const variance = ranks.reduce((sum, rank) => sum + (rank - meanRank) ** 2, 0) / ranks.length;
        const rankStdDev = Math.sqrt(variance);
        const spread = Math.max(...ranks) - Math.min(...ranks);
        const stability: SensitivityResult['stability'] = spread <= 2 && rankStdDev <= 1 ? 'ALTA' : spread <= 5 && rankStdDev <= 2.5 ? 'MEDIA' : 'BAIXA';
        result.push({
            id: row.id,
            baseScore: base.score,
            baseRank: base.rank,
            minRank: Math.min(...ranks),
            maxRank: Math.max(...ranks),
            meanRank,
            rankStdDev,
            scenarios: ranks.length,
            stability,
        });
    }

    return result.sort((a, b) => a.baseRank - b.baseRank);
}
