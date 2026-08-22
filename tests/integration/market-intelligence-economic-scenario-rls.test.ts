import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma, withRlsContext } from '../../src/lib/prisma';
import { requestContext } from '../../src/lib/async-context';
import { economicScenarioService } from '../../src/features/market-intelligence/server/economicScenario.service';
import type { EconomicScenarioSavePayload } from '../../src/features/market-intelligence/server/economicScenario.schemas';

const ORG_A = 'test-org-mi-economic-a';
const ORG_B = 'test-org-mi-economic-b';
const USER_A = 'test-user-mi-economic-a';
const USER_B = 'test-user-mi-economic-b';

const asTenant = (tenantId: string) => requestContext.enterWith({ tenantId, userId: tenantId === ORG_A ? USER_A : USER_B, role: 'GESTOR' });
const asBypass = () => requestContext.enterWith({ bypassRls: true });

const baseInput = (): EconomicScenarioSavePayload => ({
    label: 'Cenário auditável Guarujá',
    territoryId: 'core-3518701-100',
    serviceableSharePct: 10,
    costs: {
        salary: 6000,
        payrollCharges: 4200,
        benefits: 1200,
        vehicle: 2500,
        fuel: 1800,
        lodging: 1000,
        tolls: 500,
        fixedCommission: 0,
        tools: 700,
        administration: 1000,
    },
    revenue: {
        averageMrrTicket: 3500,
        grossMarginPct: 60,
        winRatePct: 30,
        meetingToQualifiedOpportunityPct: 50,
        monthlyChurnPct: 1,
        salesCycleDays: 45,
        fullProductivityQualifiedOpportunitiesPerMonth: 12,
        variableCommissionPctOfNewMrr: 5,
        penetrationPct: 1,
    },
    upfrontInvestment: 8000,
    policy: { maxPaybackMonths: 12, minRoi12Pct: 0, minRoi24Pct: null },
    scenario: 'BASE',
    calibration: { applied: false, snapshot: null },
});

async function hardDeleteFixture(): Promise<void> {
    asBypass();
    await withRlsContext(async (tx) => {
        await tx.$executeRaw`DELETE FROM "MarketIntelligenceEconomicScenario" WHERE "organizationId" IN (${ORG_A}, ${ORG_B})`;
    });
    await prisma.user.deleteMany({ where: { id: { in: [USER_A, USER_B] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [ORG_A, ORG_B] } } });
}

describe('Market Intelligence v1.4 — economic scenario audit', () => {
    beforeEach(async () => {
        asBypass();
        for (const [id, name] of [[ORG_A, 'MI Economic A'], [ORG_B, 'MI Economic B']] as const) {
            await prisma.organization.upsert({ where: { id }, update: {}, create: { id, name } });
        }
        await prisma.user.upsert({
            where: { email: 'mi-economic-a@example.test' },
            update: { organizationId: ORG_A },
            create: { id: USER_A, name: 'MI Economic A', email: 'mi-economic-a@example.test', organizationId: ORG_A, role: 'GESTOR' },
        });
        await prisma.user.upsert({
            where: { email: 'mi-economic-b@example.test' },
            update: { organizationId: ORG_B },
            create: { id: USER_B, name: 'MI Economic B', email: 'mi-economic-b@example.test', organizationId: ORG_B, role: 'GESTOR' },
        });
        await withRlsContext(async (tx) => {
            await tx.$executeRaw`DELETE FROM "MarketIntelligenceEconomicScenario" WHERE "organizationId" IN (${ORG_A}, ${ORG_B})`;
        });
    });

    afterEach(hardDeleteFixture);

    it('salva snapshot canônico e ignora CRM não aplicado na identidade do cenário', async () => {
        asTenant(ORG_A);
        const first = await economicScenarioService.save(ORG_A, USER_A, baseInput());
        const sameEconomicsWithUnappliedCrm = baseInput();
        sameEconomicsWithUnappliedCrm.calibration = {
            applied: false,
            snapshot: {
                quality: 'ALTA',
                eligible: true,
                totalClosedSample: 80,
                monthsWithClosedSample: 4,
                fromPeriod: '2026-03',
                toPeriod: '2026-06',
                recommended: { averageMrrTicket: 9000, winRatePct: 55, salesCycleDays: 20 },
                blockers: [],
            },
        };
        const second = await economicScenarioService.save(ORG_A, USER_A, sameEconomicsWithUnappliedCrm);

        expect(second.id).toBe(first.id);
        expect(second.snapshotHash).toBe(first.snapshotHash);
        expect(first.snapshot.input.calibration).toEqual({ applied: false, snapshot: null });
        expect(first.snapshot.territory.baseCity).toBe('Guarujá');
        expect(first.snapshot.assessment.economics.monthlyFixedCost).toBeGreaterThan(0);

        const list = await economicScenarioService.list(ORG_A, { limit: 20 });
        expect(list).toHaveLength(1);
        expect(list[0].territoryId).toBe('core-3518701-100');
    });

    it('RLS e filtro explícito impedem outro tenant de ler o snapshot', async () => {
        asTenant(ORG_A);
        const saved = await economicScenarioService.save(ORG_A, USER_A, baseInput());

        asTenant(ORG_B);
        await expect(economicScenarioService.get(ORG_B, saved.id)).rejects.toMatchObject({ statusCode: 404 });
        expect(await economicScenarioService.list(ORG_B, { limit: 20 })).toEqual([]);
    });

    it('rejeita alegação falsa de calibração CRM aplicada', async () => {
        asTenant(ORG_A);
        const input = baseInput();
        input.calibration = {
            applied: true,
            snapshot: {
                quality: 'ALTA',
                eligible: true,
                totalClosedSample: 80,
                monthsWithClosedSample: 4,
                fromPeriod: '2026-03',
                toPeriod: '2026-06',
                recommended: { averageMrrTicket: 9000, winRatePct: 55, salesCycleDays: 20 },
                blockers: [],
            },
        };

        await expect(economicScenarioService.save(ORG_A, USER_A, input)).rejects.toMatchObject({ statusCode: 400 });
    });
});
