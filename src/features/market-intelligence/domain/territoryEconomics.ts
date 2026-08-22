import type { TerritoryRecord } from './MarketIntelligence';
import {
    calculateSellerEconomicScenario,
    type CommercialScenario,
    type SellerEconomicSummary,
    type SellerModelAssumptions,
} from './sellerEconomics';

export type EconomicRecommendation =
    | 'PREMISSAS_PENDENTES'
    | 'POLITICA_PENDENTE'
    | 'RECOMENDADO'
    | 'NAO_RECOMENDADO';

export interface TerritoryMarketAssumptions {
    /** Percentual das contas ICP territoriais que a operação realmente consegue atender. */
    serviceableSharePct: number;
}

export interface EconomicDecisionPolicy {
    /** Prazo máximo aceito para recuperar investimento e operação. */
    maxPaybackMonths: number | null;
    /** ROI mínimo exigido em 12 meses. */
    minRoi12Pct: number | null;
    /** ROI mínimo opcional em 24 meses. */
    minRoi24Pct: number | null;
}

export interface TerritoryEconomicAssessment {
    territoryId: string;
    baseCity: string;
    uf: string;
    opportunityScore: number | null;
    confidence: TerritoryRecord['confidence'];
    tamAccounts: number | null;
    serviceableSharePct: number;
    samAccounts: number | null;
    scenario: CommercialScenario;
    economics: SellerEconomicSummary;
    recommendation: EconomicRecommendation;
    blockers: string[];
    failedPolicyRules: string[];
}

function pct(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value / 100));
}

function sumMonthlyCosts(model: SellerModelAssumptions): number {
    return Object.values(model.costs).reduce(
        (sum, value) => sum + (Number.isFinite(value) ? Math.max(0, value) : 0),
        0,
    );
}

function territoryHasHubEvidence(territory: TerritoryRecord): boolean {
    return territory.evidenceIds.some((id) => id === 'hub-suitability' || id.startsWith('hub-suitability:'));
}

export function deriveTerritorySam(
    territory: TerritoryRecord,
    serviceableSharePct: number,
): number | null {
    const tam = territory.icp.total;
    if (tam === null || tam < 0 || !Number.isFinite(tam)) return null;
    const share = pct(serviceableSharePct);
    if (share <= 0) return null;
    return Math.floor(tam * share);
}

/**
 * O simulador pode calcular cenários exploratórios sobre territórios Core, mas não pode produzir
 * `RECOMENDADO` enquanto a evidência territorial necessária à contratação final estiver faltando.
 * Assim a proteção não depende apenas de um banner de UI.
 */
export function validateEconomicAssumptions(
    territory: TerritoryRecord,
    market: TerritoryMarketAssumptions,
    model: SellerModelAssumptions,
): string[] {
    const blockers: string[] = [];

    if (territory.competition.censusStatus !== 'CENSO_COMPLETO') {
        blockers.push(`Evidência competitiva pendente: censo está ${territory.competition.censusStatus.replaceAll('_', ' ')}; White Space final continua bloqueado.`);
    }
    if (!territoryHasHubEvidence(territory)) {
        blockers.push('Hub Suitability pendente: a cidade-base ainda não possui evidência validada de conectividade e eficiência operacional.');
    }
    if (territory.icp.total === null || territory.icp.total <= 0) {
        blockers.push('TAM territorial indisponível: o território não possui contas ICP observáveis.');
    }
    if (market.serviceableSharePct <= 0) {
        blockers.push('Informe o percentual das contas ICP que a operação consegue atender para derivar o SAM.');
    }
    if (sumMonthlyCosts(model) <= 0) {
        blockers.push('Informe pelo menos um custo mensal real do vendedor.');
    }
    if (model.revenue.averageMrrTicket <= 0) {
        blockers.push('Informe o ticket MRR médio.');
    }
    if (model.revenue.grossMarginPct <= 0) {
        blockers.push('Informe a margem bruta.');
    }
    if (model.revenue.winRatePct <= 0) {
        blockers.push('Informe o Win Rate.');
    }
    if (model.revenue.meetingToQualifiedOpportunityPct <= 0) {
        blockers.push('Informe a conversão de reunião para oportunidade qualificada.');
    }
    if (model.revenue.fullProductivityQualifiedOpportunitiesPerMonth <= 0) {
        blockers.push('Informe a capacidade mensal de oportunidades qualificadas em produtividade plena.');
    }
    if (model.revenue.penetrationPct <= 0) {
        blockers.push('Informe a penetração esperada sobre o SAM.');
    }
    return blockers;
}

export function economicPolicyReady(policy: EconomicDecisionPolicy): boolean {
    return policy.maxPaybackMonths !== null
        && policy.maxPaybackMonths > 0
        && policy.minRoi12Pct !== null
        && Number.isFinite(policy.minRoi12Pct);
}

export function assessTerritoryEconomics(
    territory: TerritoryRecord,
    market: TerritoryMarketAssumptions,
    model: SellerModelAssumptions,
    policy: EconomicDecisionPolicy,
    scenario: CommercialScenario = 'BASE',
): TerritoryEconomicAssessment {
    const samAccounts = deriveTerritorySam(territory, market.serviceableSharePct);
    const blockers = validateEconomicAssumptions(territory, market, model);
    const scopedModel: SellerModelAssumptions = {
        ...model,
        revenue: {
            ...model.revenue,
            samAccounts,
        },
    };
    const economics = calculateSellerEconomicScenario(scopedModel, scenario, 24);
    const failedPolicyRules: string[] = [];

    if (blockers.length) {
        return {
            territoryId: territory.id,
            baseCity: territory.baseCity,
            uf: territory.uf,
            opportunityScore: territory.opportunityScore,
            confidence: territory.confidence,
            tamAccounts: territory.icp.total,
            serviceableSharePct: market.serviceableSharePct,
            samAccounts,
            scenario,
            economics,
            recommendation: 'PREMISSAS_PENDENTES',
            blockers,
            failedPolicyRules,
        };
    }

    if (!economicPolicyReady(policy)) {
        return {
            territoryId: territory.id,
            baseCity: territory.baseCity,
            uf: territory.uf,
            opportunityScore: territory.opportunityScore,
            confidence: territory.confidence,
            tamAccounts: territory.icp.total,
            serviceableSharePct: market.serviceableSharePct,
            samAccounts,
            scenario,
            economics,
            recommendation: 'POLITICA_PENDENTE',
            blockers: ['Defina o payback máximo aceito e o ROI mínimo de 12 meses para autorizar a contratação.'],
            failedPolicyRules,
        };
    }

    if (economics.breakEvenContracts !== null
        && economics.maximumCaptureContracts !== null
        && economics.maximumCaptureContracts < economics.breakEvenContracts) {
        failedPolicyRules.push(
            `SOM máximo (${economics.maximumCaptureContracts} contratos) é menor que o break-even mensal (${economics.breakEvenContracts}).`,
        );
    }
    if (economics.paybackMonth === null) {
        failedPolicyRules.push('Payback não é atingido em 24 meses.');
    } else if (policy.maxPaybackMonths !== null && economics.paybackMonth > policy.maxPaybackMonths) {
        failedPolicyRules.push(`Payback de ${economics.paybackMonth} meses excede o máximo de ${policy.maxPaybackMonths} meses.`);
    }
    if (economics.roi12Pct === null) {
        failedPolicyRules.push('ROI de 12 meses não é calculável com as premissas atuais.');
    } else if (policy.minRoi12Pct !== null && economics.roi12Pct < policy.minRoi12Pct) {
        failedPolicyRules.push(`ROI de 12 meses (${economics.roi12Pct.toFixed(1)}%) está abaixo do mínimo de ${policy.minRoi12Pct}%.`);
    }
    if (policy.minRoi24Pct !== null) {
        if (economics.roi24Pct === null) {
            failedPolicyRules.push('ROI de 24 meses não é calculável com as premissas atuais.');
        } else if (economics.roi24Pct < policy.minRoi24Pct) {
            failedPolicyRules.push(`ROI de 24 meses (${economics.roi24Pct.toFixed(1)}%) está abaixo do mínimo de ${policy.minRoi24Pct}%.`);
        }
    }

    return {
        territoryId: territory.id,
        baseCity: territory.baseCity,
        uf: territory.uf,
        opportunityScore: territory.opportunityScore,
        confidence: territory.confidence,
        tamAccounts: territory.icp.total,
        serviceableSharePct: market.serviceableSharePct,
        samAccounts,
        scenario,
        economics,
        recommendation: failedPolicyRules.length ? 'NAO_RECOMENDADO' : 'RECOMENDADO',
        blockers,
        failedPolicyRules,
    };
}

const RECOMMENDATION_ORDER: Record<EconomicRecommendation, number> = {
    RECOMENDADO: 0,
    NAO_RECOMENDADO: 1,
    POLITICA_PENDENTE: 2,
    PREMISSAS_PENDENTES: 3,
};

export function compareTerritoryEconomics(
    territories: TerritoryRecord[],
    market: TerritoryMarketAssumptions,
    model: SellerModelAssumptions,
    policy: EconomicDecisionPolicy,
    scenario: CommercialScenario = 'BASE',
): TerritoryEconomicAssessment[] {
    return territories
        .map((territory) => assessTerritoryEconomics(territory, market, model, policy, scenario))
        .sort((a, b) => {
            const recommendation = RECOMMENDATION_ORDER[a.recommendation] - RECOMMENDATION_ORDER[b.recommendation];
            if (recommendation !== 0) return recommendation;
            const paybackA = a.economics.paybackMonth ?? Number.POSITIVE_INFINITY;
            const paybackB = b.economics.paybackMonth ?? Number.POSITIVE_INFINITY;
            if (paybackA !== paybackB) return paybackA - paybackB;
            const roiA = a.economics.roi12Pct ?? Number.NEGATIVE_INFINITY;
            const roiB = b.economics.roi12Pct ?? Number.NEGATIVE_INFINITY;
            if (roiA !== roiB) return roiB - roiA;
            return (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0);
        });
}
