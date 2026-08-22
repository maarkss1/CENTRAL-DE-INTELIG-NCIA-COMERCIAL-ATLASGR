export type DataAvailability = 'OBSERVADO' | 'ESTIMADO' | 'PROXY' | 'PREMISSA_EDITAVEL' | 'NAO_DISPONIVEL';
export type ConfidenceLevel = 'ALTO' | 'MEDIO' | 'BAIXO' | 'BLOQUEADO';
export type CensusStatus = 'NAO_PESQUISADO' | 'PESQUISA_PARCIAL' | 'CENSO_COMPLETO';
export type IcpTier = 'A' | 'B' | 'C';

export interface SourceEvidence {
    id: string;
    dataset: string;
    sourceName: string;
    sourceUrl?: string;
    competence?: string;
    accessedAt?: string;
    geographyLevel?: 'BRASIL' | 'REGIAO' | 'UF' | 'MUNICIPIO' | 'CORREDOR' | 'CONTA';
    availability: DataAvailability;
    confidence: ConfidenceLevel;
    note?: string;
}

export interface ScoreComponent {
    value: number | null;
    confidence: number;
    availability: DataAvailability;
    reason?: string;
}

export interface MunicipalityScores {
    demand: ScoreComponent;
    risk: ScoreComponent;
    competitionPressure: ScoreComponent;
    whiteSpace: ScoreComponent;
    territorialEfficiency: ScoreComponent;
    rawOpportunity: ScoreComponent;
    confidenceAdjustedOpportunity: ScoreComponent;
}

export interface IcpPopulation {
    total: number | null;
    tierA: number | null;
    tierB: number | null;
    tierC: number | null;
}

export interface RntrcMetrics {
    transporters: number | null;
    etc: number | null;
    tac: number | null;
    ctc: number | null;
    etcEquiparada: number | null;
    activeVehicles: number | null;
    tractionVehicles: number | null;
    implements: number | null;
}

export interface MdfeMetrics {
    trips: number | null;
    manifests: number | null;
    tonnes: number | null;
    tku: number | null;
    interstateShare: number | null;
}

export interface RiskMetrics {
    cargoRobbery: number | null;
    vehicleRobbery: number | null;
    vehicleTheft: number | null;
    geography: 'MUNICIPIO' | 'PROXY_UF' | 'NAO_DISPONIVEL';
}

export interface CompetitionMetrics {
    censusStatus: CensusStatus;
    verifiedPresences: number;
    directRiskManagement: number;
    tracking: number;
    monitoring: number;
    readyResponse: number;
    nationalRemoteCoverage: number;
}

export interface CommercialEconomics {
    tamAccounts: number | null;
    samAccounts: number | null;
    somAccounts: number | null;
    potentialMrr: number | null;
    breakEvenContracts: number | null;
    requiredPipeline: number | null;
}

export interface MunicipalityRecord {
    ibgeCode: string;
    name: string;
    uf: string;
    region: string;
    latitude: number | null;
    longitude: number | null;
    icp: IcpPopulation;
    rntrc: RntrcMetrics;
    mdfe: MdfeMetrics;
    risk: RiskMetrics;
    competition: CompetitionMetrics;
    scores: MunicipalityScores;
    economics: CommercialEconomics;
    evidenceIds: string[];
}

export interface TerritoryRecord {
    id: string;
    baseIbgeCode: string;
    baseCity: string;
    uf: string;
    radiusKm: 100 | 150 | 200 | 250 | 300 | 400;
    municipalityCodes: string[];
    municipalityCount: number;
    icp: IcpPopulation;
    rntrc: RntrcMetrics;
    mdfe: MdfeMetrics;
    competition: CompetitionMetrics;
    opportunityScore: number | null;
    confidence: ConfidenceLevel;
    economics: CommercialEconomics;
    evidenceIds: string[];
}

export interface DatasetHealth {
    id: 'rntrc' | 'fleet' | 'cnpj' | 'mdfe' | 'risk' | 'competition' | 'ibge' | 'hub-suitability';
    label: string;
    status: 'ATUALIZADO' | 'PARCIAL' | 'DESATUALIZADO' | 'NAO_DISPONIVEL';
    competence?: string;
    source?: string;
    downloadedAt?: string;
    // MI-006 (Sprint 04/Onda 16): campos que os workflows de dados (market-intelligence-
    // {cnpj,rntrc,fleet}.yml) já gravam no manifest.json, mas que a UI nunca lia — sem eles,
    // freshness/cobertura/qualidade só existiam como texto embutido em `note`, não como dado
    // exibível de forma consistente.
    probedAt?: string;
    coverage?: number;
    fleetTotal?: number;
    unmatchedRows?: number;
    unmatchedRate?: number;
    taxonomyVersion?: string;
    geography?: string;
    sha256?: string;
    note?: string;
}

export interface MarketIntelligenceManifest {
    schemaVersion: '1.0';
    generatedAt: string;
    methodologyVersion: string;
    decisionReady: boolean;
    decisionBlockers: string[];
    datasets: DatasetHealth[];
    files: {
        municipalities?: string;
        territories?: string;
        evidences?: string;
        competitors?: string;
        hubSuitability?: string;
    };
}

export interface SellerAssumptions {
    salary: number;
    payrollCharges: number;
    benefits: number;
    vehicle: number;
    fuel: number;
    lodging: number;
    tolls: number;
    commission: number;
    tools: number;
    administration: number;
    averageMrrTicket: number;
    grossMarginPct: number;
    winRatePct: number;
    penetrationPct: number;
    monthlyChurnPct: number;
    salesCycleDays: number;
}

export interface SellerEconomicsResult {
    monthlyCost: number;
    contributionPerContract: number;
    breakEvenContracts: number | null;
    breakEvenMrr: number | null;
    requiredQualifiedOpportunities: number | null;
}

export const clampScore = (value: number): number => Math.max(0, Math.min(100, value));

export function calculateSellerEconomics(input: SellerAssumptions): SellerEconomicsResult {
    const monthlyCost = input.salary + input.payrollCharges + input.benefits + input.vehicle + input.fuel
        + input.lodging + input.tolls + input.commission + input.tools + input.administration;
    const margin = input.grossMarginPct / 100;
    const winRate = input.winRatePct / 100;
    const contributionPerContract = input.averageMrrTicket * margin;
    const breakEvenContracts = contributionPerContract > 0 ? Math.ceil(monthlyCost / contributionPerContract) : null;
    const breakEvenMrr = breakEvenContracts === null ? null : breakEvenContracts * input.averageMrrTicket;
    const requiredQualifiedOpportunities = breakEvenContracts !== null && winRate > 0
        ? Math.ceil(breakEvenContracts / winRate)
        : null;
    return { monthlyCost, contributionPerContract, breakEvenContracts, breakEvenMrr, requiredQualifiedOpportunities };
}

export function censusAllowsWhiteSpace(status: CensusStatus): boolean {
    return status === 'CENSO_COMPLETO';
}

export function explainMunicipality(record: MunicipalityRecord): string[] {
    const messages: string[] = [];
    const score = (label: string, component: ScoreComponent, high = 70, low = 35) => {
        if (component.value === null) {
            messages.push(`? ${label}: NÃO DISPONÍVEL`);
        } else if (component.value >= high) {
            messages.push(`+ ${label} elevado (${Math.round(component.value)})`);
        } else if (component.value <= low) {
            messages.push(`- ${label} baixo (${Math.round(component.value)})`);
        }
    };
    score('demanda', record.scores.demand);
    score('Need / risco', record.scores.risk);
    if (record.competition.censusStatus !== 'CENSO_COMPLETO') {
        messages.push(`! concorrência: ${record.competition.censusStatus.replaceAll('_', ' ')}; White Space competitivo bloqueado`);
    } else {
        score('pressão competitiva', record.scores.competitionPressure, 70, 35);
        score('White Space', record.scores.whiteSpace);
    }
    score('eficiência territorial', record.scores.territorialEfficiency);
    return messages;
}
