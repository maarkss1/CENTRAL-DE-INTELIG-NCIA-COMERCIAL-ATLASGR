import { describe, expect, it } from 'vitest';
import type { TerritoryRecord } from '../../../src/features/market-intelligence/domain/MarketIntelligence';
import { DEFAULT_RAMP, type SellerModelAssumptions } from '../../../src/features/market-intelligence/domain/sellerEconomics';
import {
    assessTerritoryEconomics,
    compareTerritoryEconomics,
    deriveTerritorySam,
    type EconomicDecisionPolicy,
} from '../../../src/features/market-intelligence/domain/territoryEconomics';

function territory(overrides: Partial<TerritoryRecord> = {}): TerritoryRecord {
    return {
        id: 'core-1-100',
        baseIbgeCode: '1',
        baseCity: 'Ribeirão Preto',
        uf: 'SP',
        radiusKm: 100,
        municipalityCodes: ['1', '2'],
        municipalityCount: 2,
        icp: { total: 1000, tierA: 300, tierB: 400, tierC: 300 },
        rntrc: { transporters: 100, etc: 20, tac: 70, ctc: 10, etcEquiparada: 0, activeVehicles: 300, tractionVehicles: 180, implements: 120 },
        mdfe: { trips: 5000, manifests: null, tonnes: null, tku: null, interstateShare: null },
        competition: { censusStatus: 'PESQUISA_PARCIAL', verifiedPresences: 0, directRiskManagement: 0, tracking: 0, monitoring: 0, readyResponse: 0, nationalRemoteCoverage: 0 },
        opportunityScore: 80,
        confidence: 'ALTO',
        economics: { tamAccounts: 1000, samAccounts: null, somAccounts: null, potentialMrr: null, breakEvenContracts: null, requiredPipeline: null },
        evidenceIds: ['cnpj', 'rntrc', 'mdfe-ciot'],
        ...overrides,
    };
}

const model: SellerModelAssumptions = {
    costs: {
        salary: 6000,
        payrollCharges: 3000,
        benefits: 1000,
        vehicle: 2000,
        fuel: 1500,
        lodging: 500,
        tolls: 500,
        fixedCommission: 0,
        tools: 500,
        administration: 500,
    },
    revenue: {
        averageMrrTicket: 3000,
        grossMarginPct: 65,
        winRatePct: 30,
        meetingToQualifiedOpportunityPct: 50,
        monthlyChurnPct: 1,
        salesCycleDays: 60,
        fullProductivityQualifiedOpportunitiesPerMonth: 20,
        variableCommissionPctOfNewMrr: 5,
        samAccounts: null,
        penetrationPct: 10,
    },
    ramp: DEFAULT_RAMP,
    upfrontInvestment: 12000,
};

const policy: EconomicDecisionPolicy = {
    maxPaybackMonths: 18,
    minRoi12Pct: -20,
    minRoi24Pct: 0,
};

describe('territory economics v1.2', () => {
    it('deriva SAM somente de TAM observado x atendibilidade explicita', () => {
        expect(deriveTerritorySam(territory(), 25)).toBe(250);
        expect(deriveTerritorySam(territory(), 0)).toBeNull();
        expect(deriveTerritorySam(territory({ icp: { total: null, tierA: null, tierB: null, tierC: null } }), 25)).toBeNull();
    });

    it('mantem a decisao bloqueada quando faltam premissas comerciais reais', () => {
        const emptyModel: SellerModelAssumptions = {
            costs: Object.fromEntries(Object.keys(model.costs).map((key) => [key, 0])) as SellerModelAssumptions['costs'],
            revenue: { ...model.revenue, averageMrrTicket: 0, grossMarginPct: 0, winRatePct: 0, meetingToQualifiedOpportunityPct: 0, fullProductivityQualifiedOpportunitiesPerMonth: 0, penetrationPct: 0 },
            ramp: DEFAULT_RAMP,
        };
        const result = assessTerritoryEconomics(territory(), { serviceableSharePct: 0 }, emptyModel, policy, 'BASE');
        expect(result.recommendation).toBe('PREMISSAS_PENDENTES');
        expect(result.blockers.length).toBeGreaterThanOrEqual(6);
    });

    it('nao emite recomendacao sem politica explicita de payback e ROI', () => {
        const result = assessTerritoryEconomics(
            territory(),
            { serviceableSharePct: 25 },
            model,
            { maxPaybackMonths: null, minRoi12Pct: null, minRoi24Pct: null },
            'BASE',
        );
        expect(result.samAccounts).toBe(250);
        expect(result.recommendation).toBe('POLITICA_PENDENTE');
    });

    it('reprova territorio cujo SOM maximo nao cobre o break-even mensal', () => {
        const tiny = territory({ icp: { total: 20, tierA: 5, tierB: 10, tierC: 5 } });
        const result = assessTerritoryEconomics(tiny, { serviceableSharePct: 10 }, model, policy, 'BASE');
        expect(result.economics.maximumCaptureContracts).not.toBeNull();
        expect(result.economics.breakEvenContracts).not.toBeNull();
        expect(result.recommendation).toBe('NAO_RECOMENDADO');
        expect(result.failedPolicyRules.some((rule) => rule.includes('SOM máximo'))).toBe(true);
    });

    it('recomenda quando capacidade territorial e politica economica sao atendidas', () => {
        const permissivePolicy: EconomicDecisionPolicy = { maxPaybackMonths: 24, minRoi12Pct: -100, minRoi24Pct: -100 };
        const result = assessTerritoryEconomics(territory(), { serviceableSharePct: 50 }, model, permissivePolicy, 'BASE');
        expect(result.samAccounts).toBe(500);
        expect(result.recommendation).toBe('RECOMENDADO');
        expect(result.failedPolicyRules).toEqual([]);
    });

    it('ordena territorios recomendados por payback, ROI e depois score', () => {
        const second = territory({ id: 'core-2-100', baseCity: 'Campinas', baseIbgeCode: '2', opportunityScore: 75, icp: { total: 2000, tierA: 600, tierB: 800, tierC: 600 } });
        const ranked = compareTerritoryEconomics([territory(), second], { serviceableSharePct: 50 }, model, { maxPaybackMonths: 24, minRoi12Pct: -100, minRoi24Pct: -100 }, 'BASE');
        expect(ranked).toHaveLength(2);
        expect(ranked.every((item) => item.recommendation === 'RECOMENDADO')).toBe(true);
    });
});
