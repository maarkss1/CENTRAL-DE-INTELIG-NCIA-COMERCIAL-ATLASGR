import type { DataAvailability, ScoreComponent } from './MarketIntelligence';

export const HUB_COMPONENT_KEYS = [
    'icpMateriality',
    'rntrcMateriality',
    'cargoFleetMateriality',
    'urbanCentrality',
    'roadAccessibility',
    'airportAccessibility',
] as const;

export type HubComponentKey = (typeof HUB_COMPONENT_KEYS)[number];

export interface HubSuitabilityRawRow {
    ibgeCode: string;
    name: string;
    uf: string;
    icpAccounts: number | null;
    rntrcTransporters: number | null;
    cargoFleet: number | null;
    /**
     * Ordem REGIC já transformada em ordinal numérico, onde 1 é a maior hierarquia.
     * Ex.: Grande Metrópole Nacional < Metrópole Nacional < Metrópole < ... < Centro Local.
     * A camada de ingestão deve preservar também o rótulo original em seus metadados.
     */
    regicHierarchyRank: number | null;
    /** Distância rodoviária observada/derivada da base oficial REGIC/DNIT. Menor é melhor. */
    roadDistanceToReferenceCenterKm: number | null;
    /** Distância até aeródromo público elegível segundo cadastro oficial ANAC. Menor é melhor. */
    nearestPublicAirportKm: number | null;
    evidenceIds: string[];
}

export interface HubSuitabilityRecord {
    ibgeCode: string;
    name: string;
    uf: string;
    components: Record<HubComponentKey, ScoreComponent>;
    overall: ScoreComponent;
    evidenceIds: string[];
}

export interface HubSuitabilityPolicy {
    version: string;
    weights: Record<HubComponentKey, number>;
    requiredComponents: HubComponentKey[];
    minAggregateConfidence: number;
    minOverallScore: number;
}

function unavailable(reason: string): ScoreComponent {
    return { value: null, confidence: 0, availability: 'NAO_DISPONIVEL', reason };
}

function observed(value: number | undefined, reason: string): ScoreComponent {
    return value === undefined
        ? unavailable(reason)
        : { value, confidence: 0.9, availability: 'OBSERVADO', reason };
}

function percentileMap(values: Array<[string, number]>, lowerIsBetter = false): Map<string, number> {
    const ordered = [...values].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
    const result = new Map<string, number>();
    const n = ordered.length;
    let index = 0;

    while (index < n) {
        let end = index;
        while (end + 1 < n && ordered[end + 1][1] === ordered[index][1]) end += 1;
        const averageRank = (index + end) / 2;
        const percentile = n <= 1 ? 100 : (averageRank / (n - 1)) * 100;
        const normalized = lowerIsBetter ? 100 - percentile : percentile;
        for (let cursor = index; cursor <= end; cursor += 1) {
            result.set(ordered[cursor][0], Number(normalized.toFixed(4)));
        }
        index = end + 1;
    }

    return result;
}

function finitePositive(value: number | null): value is number {
    return value !== null && Number.isFinite(value) && value >= 0;
}

function numericPairs(rows: HubSuitabilityRawRow[], getter: (row: HubSuitabilityRawRow) => number | null): Array<[string, number]> {
    const pairs: Array<[string, number]> = [];
    for (const row of rows) {
        const value = getter(row);
        if (finitePositive(value)) pairs.push([row.ibgeCode, value]);
    }
    return pairs;
}

/**
 * Materializa somente componentes observáveis/reproduzíveis.
 *
 * Importante: esta função NÃO inventa um score final. O overall permanece
 * NAO_DISPONIVEL até que assessHubSuitability receba uma política de pesos
 * explicitamente versionada e auditável.
 */
export function materializeHubSuitabilityComponents(rows: HubSuitabilityRawRow[]): HubSuitabilityRecord[] {
    const icp = percentileMap(numericPairs(rows, (row) => row.icpAccounts));
    const rntrc = percentileMap(numericPairs(rows, (row) => row.rntrcTransporters));
    const fleet = percentileMap(numericPairs(rows, (row) => row.cargoFleet));
    const regic = percentileMap(numericPairs(rows, (row) => row.regicHierarchyRank), true);
    const road = percentileMap(numericPairs(rows, (row) => row.roadDistanceToReferenceCenterKm), true);
    const airport = percentileMap(numericPairs(rows, (row) => row.nearestPublicAirportKm), true);

    return rows.map((row) => ({
        ibgeCode: row.ibgeCode,
        name: row.name,
        uf: row.uf,
        components: {
            icpMateriality: observed(icp.get(row.ibgeCode), 'Percentil nacional de contas ICP da própria cidade-base.'),
            rntrcMateriality: observed(rntrc.get(row.ibgeCode), 'Percentil nacional de transportadores RNTRC da própria cidade-base.'),
            cargoFleetMateriality: observed(fleet.get(row.ibgeCode), 'Percentil nacional de frota de carga SENATRAN da própria cidade-base.'),
            urbanCentrality: observed(regic.get(row.ibgeCode), 'Percentil invertido da hierarquia urbana REGIC: maior hierarquia recebe maior score.'),
            roadAccessibility: observed(road.get(row.ibgeCode), 'Percentil invertido da distância rodoviária oficial à centralidade de referência: menor distância recebe maior score.'),
            airportAccessibility: observed(airport.get(row.ibgeCode), 'Percentil invertido da distância até aeródromo público elegível ANAC: menor distância recebe maior score.'),
        },
        overall: unavailable('Score agregado de Hub Suitability bloqueado até política de pesos Atlas ser aprovada e versionada.'),
        evidenceIds: [...new Set(row.evidenceIds)],
    }));
}

function validatePolicy(policy: HubSuitabilityPolicy): void {
    const weights = HUB_COMPONENT_KEYS.map((key) => policy.weights[key]);
    if (weights.some((weight) => !Number.isFinite(weight) || weight < 0)) {
        throw new Error('Hub Suitability policy possui peso inválido.');
    }
    if (weights.reduce((sum, weight) => sum + weight, 0) <= 0) {
        throw new Error('Hub Suitability policy precisa de ao menos um peso positivo.');
    }
    if (!Number.isFinite(policy.minAggregateConfidence) || policy.minAggregateConfidence < 0 || policy.minAggregateConfidence > 1) {
        throw new Error('Hub Suitability policy possui minAggregateConfidence inválido.');
    }
    if (!Number.isFinite(policy.minOverallScore) || policy.minOverallScore < 0 || policy.minOverallScore > 100) {
        throw new Error('Hub Suitability policy possui minOverallScore inválido.');
    }
}

function weightedGeometricConfidence(components: Array<{ weight: number; confidence: number }>): number {
    const active = components.filter((item) => item.weight > 0);
    if (!active.length || active.some((item) => item.confidence <= 0)) return 0;
    const totalWeight = active.reduce((sum, item) => sum + item.weight, 0);
    const logMean = active.reduce((sum, item) => sum + (item.weight / totalWeight) * Math.log(item.confidence), 0);
    return Math.exp(logMean);
}

export interface HubSuitabilityAssessment {
    record: HubSuitabilityRecord;
    policyVersion: string;
    decisionEligible: boolean;
    blockers: string[];
}

/**
 * Aplica uma política Atlas EXPLÍCITA. A política não fica embutida no algoritmo:
 * isso permite sensitivity analysis e evita transformar pesos arbitrários em fato.
 */
export function assessHubSuitability(record: HubSuitabilityRecord, policy: HubSuitabilityPolicy): HubSuitabilityAssessment {
    validatePolicy(policy);
    const blockers: string[] = [];

    for (const key of policy.requiredComponents) {
        if (record.components[key].value === null) blockers.push(`${key}: evidência obrigatória indisponível.`);
    }

    const active = HUB_COMPONENT_KEYS
        .map((key) => ({ key, weight: policy.weights[key], component: record.components[key] }))
        .filter((item) => item.weight > 0);
    const missingWeighted = active.filter((item) => item.component.value === null);
    if (missingWeighted.length) {
        blockers.push(`Componentes ponderados indisponíveis: ${missingWeighted.map((item) => item.key).join(', ')}.`);
    }

    if (blockers.length) {
        return {
            record: { ...record, overall: unavailable(blockers.join(' ')) },
            policyVersion: policy.version,
            decisionEligible: false,
            blockers,
        };
    }

    const totalWeight = active.reduce((sum, item) => sum + item.weight, 0);
    const score = active.reduce((sum, item) => sum + (item.component.value ?? 0) * item.weight, 0) / totalWeight;
    const aggregateConfidence = weightedGeometricConfidence(active.map((item) => ({ weight: item.weight, confidence: item.component.confidence })));
    const availability: DataAvailability = 'ESTIMADO';
    const overall: ScoreComponent = {
        value: Number(score.toFixed(4)),
        confidence: aggregateConfidence,
        availability,
        reason: `Hub Suitability calculado pela política ${policy.version}; componentes de origem permanecem rastreáveis separadamente.`,
    };

    if (aggregateConfidence < policy.minAggregateConfidence) {
        blockers.push(`Confiança agregada ${(aggregateConfidence * 100).toFixed(1)}% abaixo do mínimo ${(policy.minAggregateConfidence * 100).toFixed(1)}%.`);
    }
    if (score < policy.minOverallScore) {
        blockers.push(`Hub Suitability ${score.toFixed(1)} abaixo do mínimo ${policy.minOverallScore.toFixed(1)}.`);
    }

    return {
        record: { ...record, overall },
        policyVersion: policy.version,
        decisionEligible: blockers.length === 0,
        blockers,
    };
}
