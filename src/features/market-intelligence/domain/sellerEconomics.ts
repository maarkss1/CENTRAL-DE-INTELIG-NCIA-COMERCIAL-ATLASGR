export type CommercialScenario = 'CONSERVADOR' | 'BASE' | 'AGRESSIVO';

export interface SellerCostAssumptions {
    salary: number;
    payrollCharges: number;
    benefits: number;
    vehicle: number;
    fuel: number;
    lodging: number;
    tolls: number;
    fixedCommission: number;
    tools: number;
    administration: number;
}

export interface RevenueAssumptions {
    averageMrrTicket: number;
    grossMarginPct: number;
    winRatePct: number;
    meetingToQualifiedOpportunityPct: number;
    monthlyChurnPct: number;
    salesCycleDays: number;
    fullProductivityQualifiedOpportunitiesPerMonth: number;
    variableCommissionPctOfNewMrr: number;
    samAccounts: number | null;
    penetrationPct: number;
}

export interface RampPoint {
    month: number;
    productivityPct: number;
}

export interface SellerModelAssumptions {
    costs: SellerCostAssumptions;
    revenue: RevenueAssumptions;
    ramp: RampPoint[];
}

export interface ScenarioFactors {
    ticket: number;
    winRate: number;
    penetration: number;
    grossMargin: number;
    cost: number;
    opportunityProductivity: number;
}

export interface MonthlySellerForecast {
    month: number;
    productivityPct: number;
    qualifiedOpportunitiesCreated: number;
    expectedNewContracts: number;
    activeContracts: number;
    endingMrr: number;
    grossContribution: number;
    fixedCost: number;
    variableCommission: number;
    netContribution: number;
    cumulativeNetContribution: number;
}

export interface SellerEconomicSummary {
    scenario: CommercialScenario;
    monthlyFixedCost: number;
    contributionPerContract: number | null;
    breakEvenContracts: number | null;
    breakEvenMrr: number | null;
    qualifiedOpportunitiesForBreakEven: number | null;
    meetingsForBreakEven: number | null;
    pipelineMrrForBreakEven: number | null;
    maximumCaptureContracts: number | null;
    paybackMonth: number | null;
    roi12Pct: number | null;
    roi24Pct: number | null;
    endingMrr12: number;
    endingMrr24: number;
    forecast: MonthlySellerForecast[];
}

export const DEFAULT_RAMP: RampPoint[] = [
    { month: 1, productivityPct: 25 },
    { month: 2, productivityPct: 40 },
    { month: 3, productivityPct: 60 },
    { month: 4, productivityPct: 75 },
    { month: 6, productivityPct: 90 },
    { month: 12, productivityPct: 100 },
];

export const SCENARIO_FACTORS: Record<CommercialScenario, ScenarioFactors> = {
    CONSERVADOR: { ticket: 0.85, winRate: 0.80, penetration: 0.70, grossMargin: 0.95, cost: 1.10, opportunityProductivity: 0.80 },
    BASE: { ticket: 1, winRate: 1, penetration: 1, grossMargin: 1, cost: 1, opportunityProductivity: 1 },
    AGRESSIVO: { ticket: 1.15, winRate: 1.20, penetration: 1.25, grossMargin: 1.03, cost: 0.95, opportunityProductivity: 1.20 },
};

function pct(value: number): number {
    return Math.max(0, Math.min(1, value / 100));
}

function nonNegative(value: number): number {
    return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function sumCosts(costs: SellerCostAssumptions): number {
    return Object.values(costs).reduce((sum, value) => sum + nonNegative(value), 0);
}

function productivityForMonth(month: number, points: RampPoint[]): number {
    const sorted = [...points]
        .filter((point) => point.month >= 1 && point.productivityPct >= 0)
        .sort((a, b) => a.month - b.month);
    if (!sorted.length) return 0;
    let current = sorted[0].month > month ? 0 : pct(sorted[0].productivityPct);
    for (const point of sorted) {
        if (point.month > month) break;
        current = pct(point.productivityPct);
    }
    return current;
}

function safeDivide(numerator: number, denominator: number): number | null {
    return denominator > 0 ? numerator / denominator : null;
}

function applyScenario(model: SellerModelAssumptions, scenario: CommercialScenario) {
    const factor = SCENARIO_FACTORS[scenario];
    const revenue = model.revenue;
    const ticket = nonNegative(revenue.averageMrrTicket) * factor.ticket;
    const winRate = Math.min(1, pct(revenue.winRatePct) * factor.winRate);
    const margin = Math.min(1, pct(revenue.grossMarginPct) * factor.grossMargin);
    const penetration = Math.min(1, pct(revenue.penetrationPct) * factor.penetration);
    const churn = Math.min(1, pct(revenue.monthlyChurnPct));
    const meetingsToOpportunity = Math.min(1, pct(revenue.meetingToQualifiedOpportunityPct));
    const opportunitiesAtFullProductivity = nonNegative(revenue.fullProductivityQualifiedOpportunitiesPerMonth) * factor.opportunityProductivity;
    const fixedCost = sumCosts(model.costs) * factor.cost;
    const variableCommission = Math.min(1, pct(revenue.variableCommissionPctOfNewMrr));
    const salesCycleMonths = Math.max(0, Math.ceil(nonNegative(revenue.salesCycleDays) / 30));
    const maxCaptureContracts = revenue.samAccounts === null ? null : Math.floor(Math.max(0, revenue.samAccounts) * penetration);
    return { ticket, winRate, margin, churn, meetingsToOpportunity, opportunitiesAtFullProductivity, fixedCost, variableCommission, salesCycleMonths, maxCaptureContracts };
}

export function calculateSellerEconomicScenario(
    model: SellerModelAssumptions,
    scenario: CommercialScenario,
    months = 24,
): SellerEconomicSummary {
    const p = applyScenario(model, scenario);
    const contributionPerContract = p.ticket > 0 && p.margin > 0 ? p.ticket * p.margin : null;
    const breakEvenContracts = contributionPerContract ? Math.ceil(p.fixedCost / contributionPerContract) : null;
    const breakEvenMrr = breakEvenContracts !== null ? breakEvenContracts * p.ticket : null;
    const qualifiedOpportunitiesForBreakEven = breakEvenContracts !== null && p.winRate > 0 ? Math.ceil(breakEvenContracts / p.winRate) : null;
    const meetingsForBreakEven = qualifiedOpportunitiesForBreakEven !== null && p.meetingsToOpportunity > 0 ? Math.ceil(qualifiedOpportunitiesForBreakEven / p.meetingsToOpportunity) : null;
    const pipelineMrrForBreakEven = breakEvenContracts !== null && p.winRate > 0 ? (breakEvenContracts * p.ticket) / p.winRate : null;

    const forecast: MonthlySellerForecast[] = [];
    const opportunityCohorts = new Map<number, number>();
    let activeContracts = 0;
    let cumulativeNetContribution = 0;
    let capturedContracts = 0;
    let paybackMonth: number | null = null;

    for (let month = 1; month <= Math.max(1, months); month += 1) {
        const productivity = productivityForMonth(month, model.ramp);
        const qualifiedOpportunitiesCreated = p.opportunitiesAtFullProductivity * productivity;
        opportunityCohorts.set(month, qualifiedOpportunitiesCreated);

        const cohortMonth = month - p.salesCycleMonths;
        const maturedOpportunities = cohortMonth >= 1 ? (opportunityCohorts.get(cohortMonth) ?? 0) : 0;
        let expectedNewContracts = maturedOpportunities * p.winRate;
        if (p.maxCaptureContracts !== null) {
            expectedNewContracts = Math.min(expectedNewContracts, Math.max(0, p.maxCaptureContracts - capturedContracts));
        }
        capturedContracts += expectedNewContracts;

        activeContracts = activeContracts * (1 - p.churn) + expectedNewContracts;
        const endingMrr = activeContracts * p.ticket;
        const grossContribution = endingMrr * p.margin;
        const variableCommission = expectedNewContracts * p.ticket * p.variableCommission;
        const netContribution = grossContribution - p.fixedCost - variableCommission;
        cumulativeNetContribution += netContribution;
        if (paybackMonth === null && cumulativeNetContribution >= 0 && month > p.salesCycleMonths) paybackMonth = month;

        forecast.push({
            month,
            productivityPct: productivity * 100,
            qualifiedOpportunitiesCreated,
            expectedNewContracts,
            activeContracts,
            endingMrr,
            grossContribution,
            fixedCost: p.fixedCost,
            variableCommission,
            netContribution,
            cumulativeNetContribution,
        });
    }

    const roiAt = (month: number): number | null => {
        const window = forecast.filter((row) => row.month <= month);
        const cost = window.reduce((sum, row) => sum + row.fixedCost + row.variableCommission, 0);
        const contribution = window.reduce((sum, row) => sum + row.grossContribution, 0);
        const ratio = safeDivide(contribution - cost, cost);
        return ratio === null ? null : ratio * 100;
    };

    return {
        scenario,
        monthlyFixedCost: p.fixedCost,
        contributionPerContract,
        breakEvenContracts,
        breakEvenMrr,
        qualifiedOpportunitiesForBreakEven,
        meetingsForBreakEven,
        pipelineMrrForBreakEven,
        maximumCaptureContracts: p.maxCaptureContracts,
        paybackMonth,
        roi12Pct: roiAt(12),
        roi24Pct: roiAt(24),
        endingMrr12: forecast.find((row) => row.month === 12)?.endingMrr ?? 0,
        endingMrr24: forecast.find((row) => row.month === 24)?.endingMrr ?? forecast.at(-1)?.endingMrr ?? 0,
        forecast,
    };
}

export function calculateAllSellerScenarios(model: SellerModelAssumptions): SellerEconomicSummary[] {
    return (['CONSERVADOR', 'BASE', 'AGRESSIVO'] as const).map((scenario) => calculateSellerEconomicScenario(model, scenario, 24));
}
