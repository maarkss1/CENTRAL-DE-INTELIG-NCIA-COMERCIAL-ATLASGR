export const TERRITORY_RADII = [100, 150, 200, 250, 300, 400] as const;
export const SELLER_SCENARIOS = [1, 2, 3, 5, 10, 20] as const;

export interface OptimizerMunicipality {
    ibgeCode: string;
    name: string;
    uf: string;
    latitude: number;
    longitude: number;
    adjustedOpportunityScore: number | null;
    icpAccounts: number | null;
    tierABAccounts: number | null;
    confidence: number;
    decisionBlocked?: boolean;
}

export interface TerritoryCandidate {
    id: string;
    base: OptimizerMunicipality;
    radiusKm: (typeof TERRITORY_RADII)[number];
    municipalityCodes: string[];
    icpAccounts: number;
    tierABAccounts: number;
    weightedOpportunityValue: number;
    opportunityScore: number;
    confidence: number;
}

export interface OptimizedTerritory extends TerritoryCandidate {
    incrementalAccounts: number;
    overlapAccounts: number;
    incrementalValue: number;
}

export interface OptimizationScenario {
    sellerCount: number;
    territories: OptimizedTerritory[];
    uniqueAccounts: number;
    grossAccounts: number;
    overlapAccounts: number;
    coverageEfficiency: number;
    objectiveValue: number;
}

const EARTH_RADIUS_KM = 6371.0088;
const DEG = Math.PI / 180;
const GRID_DEGREES = 1;

export function haversineKm(a: Pick<OptimizerMunicipality, 'latitude' | 'longitude'>, b: Pick<OptimizerMunicipality, 'latitude' | 'longitude'>): number {
    const lat1 = a.latitude * DEG;
    const lat2 = b.latitude * DEG;
    const dLat = (b.latitude - a.latitude) * DEG;
    const dLon = (b.longitude - a.longitude) * DEG;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function gridKey(lat: number, lon: number): string {
    return `${Math.floor((lat + 90) / GRID_DEGREES)}:${Math.floor((lon + 180) / GRID_DEGREES)}`;
}

function eligible(row: OptimizerMunicipality): boolean {
    return !row.decisionBlocked
        && row.adjustedOpportunityScore !== null
        && Number.isFinite(row.adjustedOpportunityScore)
        && row.icpAccounts !== null
        && row.icpAccounts > 0
        && row.confidence > 0;
}

export function buildTerritoryCandidates(rows: OptimizerMunicipality[]): TerritoryCandidate[] {
    const eligibleRows = rows.filter(eligible);
    const buckets = new Map<string, OptimizerMunicipality[]>();
    for (const row of eligibleRows) {
        const key = gridKey(row.latitude, row.longitude);
        buckets.set(key, [...(buckets.get(key) ?? []), row]);
    }

    const candidates: TerritoryCandidate[] = [];
    for (const base of eligibleRows) {
        const baseLatCell = Math.floor((base.latitude + 90) / GRID_DEGREES);
        const baseLonCell = Math.floor((base.longitude + 180) / GRID_DEGREES);
        for (const radiusKm of TERRITORY_RADII) {
            // No Brasil, 1 grau de longitude continua > ~90 km na latitude extrema.
            // 80 km/grau deixa a busca de celulas conservadora; Haversine faz o corte exato.
            const cellRange = Math.ceil(radiusKm / 80) + 1;
            const covered: OptimizerMunicipality[] = [];
            for (let y = baseLatCell - cellRange; y <= baseLatCell + cellRange; y += 1) {
                for (let x = baseLonCell - cellRange; x <= baseLonCell + cellRange; x += 1) {
                    for (const row of buckets.get(`${y}:${x}`) ?? []) {
                        if (haversineKm(base, row) <= radiusKm) covered.push(row);
                    }
                }
            }

            const icpAccounts = covered.reduce((sum, row) => sum + (row.icpAccounts ?? 0), 0);
            if (!icpAccounts) continue;
            const tierABAccounts = covered.reduce((sum, row) => sum + (row.tierABAccounts ?? 0), 0);
            const weightedOpportunityValue = covered.reduce(
                (sum, row) => sum + (row.adjustedOpportunityScore ?? 0) * (row.icpAccounts ?? 0),
                0,
            );
            const confidence = covered.reduce(
                (sum, row) => sum + row.confidence * (row.icpAccounts ?? 0),
                0,
            ) / icpAccounts;
            candidates.push({
                id: `${base.ibgeCode}-${radiusKm}`,
                base,
                radiusKm,
                municipalityCodes: [...new Set(covered.map((row) => row.ibgeCode))].sort(),
                icpAccounts,
                tierABAccounts,
                weightedOpportunityValue,
                opportunityScore: weightedOpportunityValue / icpAccounts,
                confidence,
            });
        }
    }
    return candidates;
}

export function optimizeTerritories(
    rows: OptimizerMunicipality[],
    sellerCount: number,
    overlapPenalty = 1,
): OptimizationScenario {
    if (sellerCount <= 0) return { sellerCount: 0, territories: [], uniqueAccounts: 0, grossAccounts: 0, overlapAccounts: 0, coverageEfficiency: 0, objectiveValue: 0 };
    const byCode = new Map(rows.map((row) => [row.ibgeCode, row]));
    const candidates = buildTerritoryCandidates(rows);
    const selected: OptimizedTerritory[] = [];
    const covered = new Set<string>();
    const usedBases = new Set<string>();

    while (selected.length < sellerCount) {
        let best: OptimizedTerritory | null = null;
        let bestObjective = -Infinity;
        for (const candidate of candidates) {
            if (usedBases.has(candidate.base.ibgeCode)) continue;
            let incrementalAccounts = 0;
            let overlapAccounts = 0;
            let incrementalValue = 0;
            let overlapValue = 0;
            for (const code of candidate.municipalityCodes) {
                const row = byCode.get(code);
                if (!row || !eligible(row)) continue;
                const accounts = row.icpAccounts ?? 0;
                const value = (row.adjustedOpportunityScore ?? 0) * accounts;
                if (covered.has(code)) {
                    overlapAccounts += accounts;
                    overlapValue += value;
                } else {
                    incrementalAccounts += accounts;
                    incrementalValue += value;
                }
            }
            const objective = incrementalValue - overlapPenalty * overlapValue;
            if (objective > bestObjective && incrementalAccounts > 0) {
                bestObjective = objective;
                best = { ...candidate, incrementalAccounts, overlapAccounts, incrementalValue };
            }
        }
        if (!best) break;
        selected.push(best);
        usedBases.add(best.base.ibgeCode);
        best.municipalityCodes.forEach((code) => covered.add(code));
    }

    const uniqueAccounts = [...covered].reduce((sum, code) => sum + (byCode.get(code)?.icpAccounts ?? 0), 0);
    const grossAccounts = selected.reduce((sum, territory) => sum + territory.icpAccounts, 0);
    const overlapAccounts = Math.max(0, grossAccounts - uniqueAccounts);
    return {
        sellerCount,
        territories: selected,
        uniqueAccounts,
        grossAccounts,
        overlapAccounts,
        coverageEfficiency: grossAccounts > 0 ? uniqueAccounts / grossAccounts : 0,
        objectiveValue: selected.reduce((sum, territory) => sum + territory.incrementalValue, 0),
    };
}

export function optimizeNationalPlan(rows: OptimizerMunicipality[]): OptimizationScenario[] {
    return SELLER_SCENARIOS.map((count) => optimizeTerritories(rows, count));
}
