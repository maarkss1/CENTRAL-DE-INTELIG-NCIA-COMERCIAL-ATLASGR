import { describe, expect, it } from 'vitest';
import {
    calculateAllSellerScenarios,
    calculateSellerEconomicScenario,
    DEFAULT_RAMP,
    type SellerModelAssumptions,
} from '../../../src/features/market-intelligence/domain/sellerEconomics';

const model: SellerModelAssumptions = {
    costs: {
        salary: 6000, payrollCharges: 3000, benefits: 1000, vehicle: 2000, fuel: 1500,
        lodging: 1000, tolls: 500, fixedCommission: 0, tools: 500, administration: 500,
    },
    revenue: {
        averageMrrTicket: 2500,
        grossMarginPct: 60,
        winRatePct: 25,
        meetingToQualifiedOpportunityPct: 50,
        monthlyChurnPct: 1,
        salesCycleDays: 60,
        fullProductivityQualifiedOpportunitiesPerMonth: 20,
        variableCommissionPctOfNewMrr: 0,
        samAccounts: 500,
        penetrationPct: 10,
    },
    ramp: DEFAULT_RAMP,
};

describe('seller economics', () => {
    it('calcula break-even, oportunidades e reunioes sem inventar conversoes', () => {
        const result = calculateSellerEconomicScenario(model, 'BASE');
        expect(result.monthlyFixedCost).toBe(16000);
        expect(result.upfrontInvestment).toBe(0);
        expect(result.contributionPerContract).toBe(1500);
        expect(result.breakEvenContracts).toBe(11);
        expect(result.qualifiedOpportunitiesForBreakEven).toBe(44);
        expect(result.meetingsForBreakEven).toBe(88);
        expect(result.pipelineMrrForBreakEven).toBe(110000);
    });

    it('respeita sales cycle antes de reconhecer novos contratos', () => {
        const result = calculateSellerEconomicScenario(model, 'BASE', 6);
        expect(result.forecast[0].expectedNewContracts).toBe(0);
        expect(result.forecast[1].expectedNewContracts).toBe(0);
        expect(result.forecast[2].expectedNewContracts).toBeGreaterThan(0);
    });

    it('limita captura ao SOM derivado de SAM x penetracao', () => {
        const tiny = {
            ...model,
            revenue: { ...model.revenue, samAccounts: 10, penetrationPct: 10, fullProductivityQualifiedOpportunitiesPerMonth: 100 },
        };
        const result = calculateSellerEconomicScenario(tiny, 'BASE', 24);
        expect(result.maximumCaptureContracts).toBe(1);
        expect(result.forecast.at(-1)?.activeContracts ?? 0).toBeLessThanOrEqual(1);
    });

    it('gera os tres cenarios comerciais explicitamente', () => {
        const scenarios = calculateAllSellerScenarios(model);
        expect(scenarios.map((item) => item.scenario)).toEqual(['CONSERVADOR', 'BASE', 'AGRESSIVO']);
        expect(scenarios[0].monthlyFixedCost).toBeGreaterThan(scenarios[1].monthlyFixedCost);
        expect(scenarios[2].endingMrr24).toBeGreaterThan(scenarios[1].endingMrr24);
    });

    it('mantem resultados economicos nao calculaveis quando ticket e margem sao zero', () => {
        const empty = { ...model, revenue: { ...model.revenue, averageMrrTicket: 0, grossMarginPct: 0, winRatePct: 0 } };
        const result = calculateSellerEconomicScenario(empty, 'BASE');
        expect(result.breakEvenContracts).toBeNull();
        expect(result.qualifiedOpportunitiesForBreakEven).toBeNull();
        expect(result.pipelineMrrForBreakEven).toBeNull();
    });

    it('inclui investimento inicial no payback, acumulado e ROI', () => {
        const withoutUpfront = calculateSellerEconomicScenario(model, 'BASE');
        const withUpfront = calculateSellerEconomicScenario({ ...model, upfrontInvestment: 50000 }, 'BASE');
        expect(withUpfront.upfrontInvestment).toBe(50000);
        expect(withUpfront.forecast[0].cumulativeNetContribution)
            .toBe(withoutUpfront.forecast[0].cumulativeNetContribution - 50000);
        expect(withUpfront.roi12Pct ?? 0).toBeLessThan(withoutUpfront.roi12Pct ?? 0);
        if (withoutUpfront.paybackMonth !== null && withUpfront.paybackMonth !== null) {
            expect(withUpfront.paybackMonth).toBeGreaterThanOrEqual(withoutUpfront.paybackMonth);
        }
    });
});
