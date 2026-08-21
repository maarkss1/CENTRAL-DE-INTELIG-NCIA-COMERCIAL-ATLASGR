import type {
    ConfidenceLevel,
    MunicipalityRecord,
    ScoreComponent,
    TerritoryRecord,
} from './MarketIntelligence';
import { calculateOpportunityScore, type OpportunityWeights } from './scoreEngine';
import { buildTerritoryCandidates, type OptimizerMunicipality, type TerritoryCandidate } from './territoryOptimizer';

/**
 * Metodologia national-v1.1-core-evidence.
 *
 * Objetivo: responder "onde contratar o próximo vendedor?" somente com componentes
 * nacionais já observados/reproduzíveis. Concorrência/White Space e eficiência de rota
 * continuam visíveis como lacunas, mas NÃO recebem zero e NÃO contaminam o ranking.
 *
 * Need v1 = intensidade de risco Sinesp já normalizada por UF, com a mesma confiança
 * PROXY_UF do dado de origem. Não afirma risco municipal observado.
 */
export const CORE_EVIDENCE_WEIGHTS: OpportunityWeights = {
    icp: 0.35,
    rntrc: 0.25,
    mdfe: 0.20,
    need: 0.20,
    whiteSpace: 0,
    territorialEfficiency: 0,
};

// Sem malha/tempo de deslocamento validado, raios de 250–400 km são cenários exploratórios,
// não recomendações automáticas de lotação. O Board usa no máximo 200 km até essa camada existir.
export const CORE_DECISION_MAX_RADIUS_KM = 200;
// Uma cidade-base precisa ser comercialmente material por si só, e não apenas estar no centro
// geométrico de um grande círculo. O quartil superior é recalculado a cada snapshot nacional.
export const CORE_BASE_ICP_PERCENTILE = 0.75;
// Evita que o Top 5 seja composto por cinco pinos vizinhos representando praticamente a mesma área.
export const CORE_MAX_MUNICIPALITY_OVERLAP_RATIO = 0.65;

export interface MdfeMunicipalRow {
    ibgeCode: string;
    trips: number | null;
}

const CORE_REASON = 'Core Evidence v1.1: ICP/CNPJ 35%, RNTRC 25%, CIOT 20% e Need/risco Sinesp 20%. White Space competitivo e eficiência territorial ficam fora do score até terem evidência suficiente.';

function percentileScores(values: Map<string, number>): Map<string, number> {
    const ordered = [...values.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
    const result = new Map<string, number>();
    const n = ordered.length;
    let index = 0;
    while (index < n) {
        let end = index;
        while (end + 1 < n && ordered[end + 1][1] === ordered[index][1]) end += 1;
        const averageRank = (index + end) / 2;
        const percentile = n <= 1 ? 0 : (averageRank / (n - 1)) * 100;
        for (let cursor = index; cursor <= end; cursor += 1) result.set(ordered[cursor][0], percentile);
        index = end + 1;
    }
    return result;
}

function percentileFloor(values: number[], percentile: number): number {
    const ordered = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!ordered.length) return Number.POSITIVE_INFINITY;
    const bounded = Math.max(0, Math.min(1, percentile));
    return ordered[Math.floor((ordered.length - 1) * bounded)];
}

function component(value: number | undefined, confidence: number, availability: ScoreComponent['availability'], reason?: string): ScoreComponent {
    return value === undefined
        ? { value: null, confidence: 0, availability: 'NAO_DISPONIVEL', reason }
        : { value, confidence, availability, reason };
}

function confidenceLevel(value: number): ConfidenceLevel {
    if (value >= 0.75) return 'ALTO';
    if (value >= 0.55) return 'MEDIO';
    if (value > 0) return 'BAIXO';
    return 'BLOQUEADO';
}

function sumNullable(rows: MunicipalityRecord[], getter: (row: MunicipalityRecord) => number | null): number | null {
    const values = rows.map(getter).filter((value): value is number => value !== null && Number.isFinite(value));
    return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function censusStatus(rows: MunicipalityRecord[]): MunicipalityRecord['competition']['censusStatus'] {
    if (rows.length && rows.every((row) => row.competition.censusStatus === 'CENSO_COMPLETO')) return 'CENSO_COMPLETO';
    if (rows.some((row) => row.competition.censusStatus === 'PESQUISA_PARCIAL')) return 'PESQUISA_PARCIAL';
    return 'NAO_PESQUISADO';
}

function municipalityOverlapRatio(a: TerritoryCandidate, b: TerritoryCandidate): number {
    const smallest = Math.min(a.municipalityCodes.length, b.municipalityCodes.length);
    if (!smallest) return 0;
    const bCodes = new Set(b.municipalityCodes);
    let intersection = 0;
    for (const code of a.municipalityCodes) if (bCodes.has(code)) intersection += 1;
    return intersection / smallest;
}

function candidateIsBetter(candidate: TerritoryCandidate, current: TerritoryCandidate): boolean {
    if (candidate.opportunityScore !== current.opportunityScore) {
        return candidate.opportunityScore > current.opportunityScore;
    }
    if (candidate.confidence !== current.confidence) return candidate.confidence > current.confidence;
    if (candidate.radiusKm !== current.radiusKm) return candidate.radiusKm < current.radiusKm;
    return candidate.weightedOpportunityValue > current.weightedOpportunityValue;
}

export function hydrateCoreEvidence(
    municipalities: MunicipalityRecord[],
    origins: MdfeMunicipalRow[],
    destinations: MdfeMunicipalRow[],
): MunicipalityRecord[] {
    const rntrcValues = new Map<string, number>();
    for (const row of municipalities) {
        if (row.rntrc.transporters !== null && Number.isFinite(row.rntrc.transporters)) {
            rntrcValues.set(row.ibgeCode, row.rntrc.transporters);
        }
    }
    const rntrcPercentiles = percentileScores(rntrcValues);

    const mdfeTrips = new Map<string, number>();
    for (const row of [...origins, ...destinations]) {
        if (row.trips === null || !Number.isFinite(row.trips)) continue;
        mdfeTrips.set(row.ibgeCode, (mdfeTrips.get(row.ibgeCode) ?? 0) + row.trips);
    }
    const mdfePercentiles = percentileScores(mdfeTrips);

    return municipalities.map((row) => {
        const rntrcScore = component(
            rntrcPercentiles.get(row.ibgeCode),
            0.9,
            'OBSERVADO',
            'Percentil nacional da contagem de transportadores RNTRC ativos.',
        );
        const mdfeScore = component(
            mdfePercentiles.get(row.ibgeCode),
            0.85,
            'OBSERVADO',
            'Percentil nacional de operações CIOT como origem + destino; CIOT é proxy documentado de fluxo, não contagem literal de MDF-e.',
        );
        const needScore: ScoreComponent = row.scores.risk.value === null
            ? { value: null, confidence: 0, availability: 'NAO_DISPONIVEL', reason: 'Need indisponível porque o risco Sinesp não está disponível para a UF.' }
            : {
                value: row.scores.risk.value,
                confidence: row.scores.risk.confidence,
                availability: 'PROXY',
                reason: `Need v1 deriva diretamente do percentil de risco Sinesp PROXY_UF. ${row.scores.risk.reason ?? ''}`.trim(),
            };

        const scored = calculateOpportunityScore({
            icp: row.scores.demand,
            rntrc: rntrcScore,
            mdfe: mdfeScore,
            need: needScore,
            whiteSpace: row.scores.whiteSpace,
            territorialEfficiency: row.scores.territorialEfficiency,
        }, CORE_EVIDENCE_WEIGHTS);

        const scoreAvailability: ScoreComponent['availability'] = scored.adjusted === null ? 'NAO_DISPONIVEL' : 'ESTIMADO';
        const reason = scored.blockedReasons.length ? scored.blockedReasons.join('; ') : CORE_REASON;
        const trips = mdfeTrips.get(row.ibgeCode);

        return {
            ...row,
            mdfe: {
                ...row.mdfe,
                trips: trips ?? null,
            },
            scores: {
                ...row.scores,
                rawOpportunity: {
                    value: scored.raw,
                    confidence: scored.aggregateConfidence,
                    availability: scoreAvailability,
                    reason,
                },
                confidenceAdjustedOpportunity: {
                    value: scored.adjusted,
                    confidence: scored.aggregateConfidence,
                    availability: scoreAvailability,
                    reason,
                },
            },
            evidenceIds: trips === undefined ? row.evidenceIds : [...new Set([...row.evidenceIds, 'mdfe-ciot'])],
        };
    });
}

export function buildCoreTerritories(municipalities: MunicipalityRecord[]): TerritoryRecord[] {
    const optimizerRows: OptimizerMunicipality[] = municipalities
        .filter((row) => row.latitude !== null && row.longitude !== null)
        .map((row) => ({
            ibgeCode: row.ibgeCode,
            name: row.name,
            uf: row.uf,
            latitude: row.latitude!,
            longitude: row.longitude!,
            adjustedOpportunityScore: row.scores.confidenceAdjustedOpportunity.value,
            icpAccounts: row.icp.total,
            tierABAccounts: row.icp.tierA === null || row.icp.tierB === null ? null : row.icp.tierA + row.icp.tierB,
            confidence: row.scores.confidenceAdjustedOpportunity.confidence,
            decisionBlocked: row.scores.confidenceAdjustedOpportunity.value === null,
        }));

    const baseIcpFloor = percentileFloor(
        optimizerRows
            .map((row) => row.icpAccounts)
            .filter((value): value is number => value !== null && value > 0),
        CORE_BASE_ICP_PERCENTILE,
    );
    const bestByBase = new Map<string, TerritoryCandidate>();
    for (const candidate of buildTerritoryCandidates(optimizerRows)) {
        if (candidate.radiusKm > CORE_DECISION_MAX_RADIUS_KM) continue;
        if ((candidate.base.icpAccounts ?? 0) < baseIcpFloor) continue;
        const current = bestByBase.get(candidate.base.ibgeCode);
        if (!current || candidateIsBetter(candidate, current)) bestByBase.set(candidate.base.ibgeCode, candidate);
    }

    const rankedCandidates = [...bestByBase.values()].sort(
        (a, b) => b.opportunityScore - a.opportunityScore
            || b.confidence - a.confidence
            || b.weightedOpportunityValue - a.weightedOpportunityValue
            || a.radiusKm - b.radiusKm,
    );

    // Diversificação geográfica: o Top 5 precisa representar alternativas de praça, não cinco
    // centros vizinhos cobrindo quase os mesmos municípios. O mesmo filtro vale aos candidatos
    // extras para manter a tabela territorial útil e estável.
    const candidates: TerritoryCandidate[] = [];
    for (const candidate of rankedCandidates) {
        const tooSimilar = candidates.some(
            (selected) => municipalityOverlapRatio(candidate, selected) > CORE_MAX_MUNICIPALITY_OVERLAP_RATIO,
        );
        if (tooSimilar) continue;
        candidates.push(candidate);
        if (candidates.length >= 100) break;
    }

    const byCode = new Map(municipalities.map((row) => [row.ibgeCode, row]));
    const territories: TerritoryRecord[] = [];
    for (const candidate of candidates) {
        const covered = candidate.municipalityCodes
            .map((code) => byCode.get(code))
            .filter((row): row is MunicipalityRecord => Boolean(row));
        if (!covered.length) continue;

        territories.push({
            id: `core-${candidate.id}`,
            baseIbgeCode: candidate.base.ibgeCode,
            baseCity: candidate.base.name,
            uf: candidate.base.uf,
            radiusKm: candidate.radiusKm,
            municipalityCodes: candidate.municipalityCodes,
            municipalityCount: candidate.municipalityCodes.length,
            icp: {
                total: sumNullable(covered, (row) => row.icp.total),
                tierA: sumNullable(covered, (row) => row.icp.tierA),
                tierB: sumNullable(covered, (row) => row.icp.tierB),
                tierC: sumNullable(covered, (row) => row.icp.tierC),
            },
            rntrc: {
                transporters: sumNullable(covered, (row) => row.rntrc.transporters),
                etc: sumNullable(covered, (row) => row.rntrc.etc),
                tac: sumNullable(covered, (row) => row.rntrc.tac),
                ctc: sumNullable(covered, (row) => row.rntrc.ctc),
                etcEquiparada: sumNullable(covered, (row) => row.rntrc.etcEquiparada),
                activeVehicles: sumNullable(covered, (row) => row.rntrc.activeVehicles),
                tractionVehicles: sumNullable(covered, (row) => row.rntrc.tractionVehicles),
                implements: sumNullable(covered, (row) => row.rntrc.implements),
            },
            mdfe: {
                trips: sumNullable(covered, (row) => row.mdfe.trips),
                manifests: null,
                tonnes: null,
                tku: null,
                interstateShare: null,
            },
            competition: {
                censusStatus: censusStatus(covered),
                verifiedPresences: covered.reduce((sum, row) => sum + row.competition.verifiedPresences, 0),
                directRiskManagement: covered.reduce((sum, row) => sum + row.competition.directRiskManagement, 0),
                tracking: covered.reduce((sum, row) => sum + row.competition.tracking, 0),
                monitoring: covered.reduce((sum, row) => sum + row.competition.monitoring, 0),
                readyResponse: covered.reduce((sum, row) => sum + row.competition.readyResponse, 0),
                nationalRemoteCoverage: covered.reduce((sum, row) => sum + row.competition.nationalRemoteCoverage, 0),
            },
            opportunityScore: candidate.opportunityScore,
            confidence: confidenceLevel(candidate.confidence),
            economics: {
                tamAccounts: candidate.icpAccounts,
                samAccounts: null,
                somAccounts: null,
                potentialMrr: null,
                breakEvenContracts: null,
                requiredPipeline: null,
            },
            evidenceIds: [...new Set(covered.flatMap((row) => row.evidenceIds))],
        });
    }
    return territories;
}
