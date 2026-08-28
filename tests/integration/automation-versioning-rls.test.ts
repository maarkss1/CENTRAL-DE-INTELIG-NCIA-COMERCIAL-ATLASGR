import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { requestContext } from '../../src/lib/async-context';
import { automationVersioningService } from '../../src/features/automations/automation-versioning.service';
import type { Automation } from '../../src/features/automations/domain/Automation';

/**
 * Onda 42 (dossiê CPI, DEC-14): prova, contra Postgres real (RLS incluída), que `AutomationVersion`
 * — a tabela nova que sustenta o histórico de edição de regras — respeita isolamento de tenant de
 * verdade, e que `PrismaAutomationVersionStore` (via `automationVersioningService`) grava/lê um
 * registro real quando chamado dentro de um contexto de tenant.
 */
const ORG_A = 'test-org-automation-version-a';
const ORG_B = 'test-org-automation-version-b';
const AUTOMATION_ID = 'test-automation-version-rule';

const asTenant = (org: string) => requestContext.enterWith({ tenantId: org });
const asBypass = () => requestContext.enterWith({ bypassRls: true });

function makeAutomation(overrides: Partial<Automation> = {}): Automation {
    return {
        id: AUTOMATION_ID,
        name: 'Avisar em Proposta Enviada',
        enabled: true,
        trigger: 'Lead mudou de status',
        conditions: { status: 'Proposta Enviada' },
        action: 'Notificar equipe',
        actionConfig: { title: 'Nova proposta!' },
        lastRunAt: null,
        runCount: 0,
        organizationId: ORG_A,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-02T00:00:00Z'),
        ...overrides,
    };
}

async function cleanup() {
    for (const org of [ORG_A, ORG_B]) {
        asTenant(org);
        await prisma.automationVersion.deleteMany({ where: { organizationId: org } });
        await prisma.automation.deleteMany({ where: { organizationId: org } });
    }
    asBypass();
    await prisma.organization.deleteMany({ where: { id: { in: [ORG_A, ORG_B] } } });
}

describe('AutomationVersion — histórico de versões de regra (Postgres real, RLS incluída)', () => {
    beforeAll(async () => {
        await cleanup();
        asBypass();
        await prisma.organization.create({ data: { id: ORG_A, name: 'Test Org Automation Version A' } });
        await prisma.organization.create({ data: { id: ORG_B, name: 'Test Org Automation Version B' } });

        asTenant(ORG_A);
        await prisma.automation.create({
            data: {
                id: AUTOMATION_ID,
                organizationId: ORG_A,
                name: 'Avisar em Proposta Enviada',
                enabled: true,
                trigger: 'Lead_Mudou_Status',
                conditions: { status: 'Proposta Enviada' },
                action: 'Notificar_Equipe',
                actionConfig: { title: 'Nova proposta!' },
            },
        });
    });

    afterAll(cleanup);

    it('recordPriorState grava um snapshot real, e buildTimeline lê de volta com o diff correto', async () => {
        asTenant(ORG_A);
        const prior = makeAutomation({ enabled: false });

        await automationVersioningService.recordPriorState(
            ORG_A,
            AUTOMATION_ID,
            prior,
            { userId: 'user-1', email: 'sdr@atlasgr.com.br' },
            'update',
        );

        const timeline = await automationVersioningService.buildTimeline(ORG_A, makeAutomation({ enabled: true }));
        expect(timeline.history).toHaveLength(1);
        expect(timeline.history[0].changeReason).toBe('update');
        expect(timeline.history[0].editedByEmail).toBe('sdr@atlasgr.com.br');
        expect(timeline.history[0].snapshot.enabled).toBe(false);
        expect(timeline.history[0].diffToNext.some((line) => line.field === 'Status')).toBe(true);
    });

    it('RLS real: histórico gravado pelo tenant A nunca aparece numa leitura escopada ao tenant B', async () => {
        asTenant(ORG_B);
        const timelineForB = await automationVersioningService.buildTimeline(ORG_B, makeAutomation({ id: AUTOMATION_ID, organizationId: ORG_B }));
        expect(timelineForB.history).toHaveLength(0);
    });
});
