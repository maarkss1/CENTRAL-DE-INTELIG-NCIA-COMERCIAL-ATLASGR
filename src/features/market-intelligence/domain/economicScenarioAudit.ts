import type { TerritoryRecord } from './MarketIntelligence';
import type { CrmEconomicCalibration } from './crmEconomicCalibration';
import type {
    CommercialScenario,
    RevenueAssumptions,
    SellerCostAssumptions,
    SellerEconomicSummary,
} from './sellerEconomics';
import type {
    EconomicDecisionPolicy,
    EconomicRecommendation,
    TerritoryEconomicAssessment,
} from './territoryEconomics';

export const ECONOMIC_SCENARIO_AUDIT_VERSION = 'market-intelligence-economics-v1.4';
export const ECONOMIC_MODEL_VERSION = 'seller-economics-v1.2';
export const CRM_CALIBRATION_VERSION = 'crm-calibration-v1.3';

export interface EconomicScenarioSaveInput {
    label?: string;
    territoryId: string;
    serviceableSharePct: number;
    costs: SellerCostAssumptions;
    revenue: Omit<RevenueAssumptions, 'samAccounts'>;
    upfrontInvestment: number;
    policy: EconomicDecisionPolicy;
    scenario: CommercialScenario;
    calibration: {
        applied: boolean;
        snapshot: CrmEconomicCalibration | null;
    };
}

export interface EconomicScenarioCanonicalTerritory {
    id: TerritoryRecord['id'];
    baseIbgeCode: TerritoryRecord['baseIbgeCode'];
    baseCity: TerritoryRecord['baseCity'];
    uf: TerritoryRecord['uf'];
    radiusKm: TerritoryRecord['radiusKm'];
    municipalityCount: TerritoryRecord['municipalityCount'];
    opportunityScore: TerritoryRecord['opportunityScore'];
    confidence: TerritoryRecord['confidence'];
    icp: TerritoryRecord['icp'];
    evidenceIds: TerritoryRecord['evidenceIds'];
}

export interface EconomicScenarioSnapshot {
    auditVersion: typeof ECONOMIC_SCENARIO_AUDIT_VERSION;
    methodologyVersion: string;
    economicModelVersion: typeof ECONOMIC_MODEL_VERSION;
    calibrationVersion: typeof CRM_CALIBRATION_VERSION | null;
    territory: EconomicScenarioCanonicalTerritory;
    input: Omit<EconomicScenarioSaveInput, 'label' | 'territoryId'>;
    assessment: TerritoryEconomicAssessment;
}

export interface SavedEconomicScenarioSummary {
    id: string;
    label: string;
    territoryId: string;
    baseCity: string;
    uf: string;
    radiusKm: TerritoryRecord['radiusKm'];
    commercialScenario: CommercialScenario;
    recommendation: EconomicRecommendation;
    auditVersion: string;
    methodologyVersion: string;
    economicModelVersion: string;
    calibrationVersion: string | null;
    calibrationApplied: boolean;
    calibrationQuality: CrmEconomicCalibration['quality'] | null;
    tamAccounts: number | null;
    samAccounts: number | null;
    monthlyFixedCost: number;
    paybackMonth: number | null;
    roi12Pct: number | null;
    roi24Pct: number | null;
    snapshotHash: string;
    createdAt: string;
    createdBy: string | null;
}

export interface SavedEconomicScenario extends SavedEconomicScenarioSummary {
    snapshot: EconomicScenarioSnapshot;
}

export function compactEconomicAssessment(assessment: TerritoryEconomicAssessment): {
    recommendation: EconomicRecommendation;
    economics: SellerEconomicSummary;
} {
    return {
        recommendation: assessment.recommendation,
        economics: assessment.economics,
    };
}
