import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { requestContext } from '../../src/lib/async-context';
import { LeadUseCases } from '../../src/features/crm/application/LeadUseCases';
import { PrismaLeadRepository } from '../../src/features/crm/infra/PrismaLeadRepository';
import { PrismaCrm360Repository, ensureDefaultPipelines } from '../../src/features/crm360/infra/PrismaCrm360Repository';

/**
 * Prova, contra Postgres real, que os 3 caminhos de escrita que podem mover um Lead para
 * "Negócios Ganhos" (CYC-007, onda 24) passam pelo gate de fechamento determinístico
 * (`ensureManualDealClosureAllowed`/`evaluateDealClosure`): uma `Note` real e um
 * `DealClosureEvent` (`manual_crm_confirmation`) são criados quando um usuário humano confirma, e
 * a mudança de status é bloqueada (Lead não é movido) quando o `actorUserId` parece vir de
 * IA/automação — a garantia central do item.
 */

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ORG = `test-deal-closure-${RUN_ID}`;

const withRlsBypass = <T>(fn: () => Promise<T>): Promise<T> => requestContext.run({ bypassRls: true }, fn);
const asOrg = <T>(organizationId: string, fn: () => Promise<T>): Promise<T> => requestContext.run({ tenantId: organizationId }, fn);

async function seedLead(status = 'Lead_Recebido') {
    return asOrg(ORG, async () => {
        const company = await prisma.company.create({ data: { legalName: 'Empresa Teste', tradeName: 'Empresa Teste', organizationId: ORG } });
        const contact = await prisma.contact.create({ data: { name: 'Lead Teste', companyId: company.id, organizationId: ORG } });
        return prisma.lead.create({ data: { companyId: company.id, contactId: contact.id, organizationId: ORG, status: status as never } });
    });
}

const leadUseCases = new LeadUseCases(new PrismaLeadRepository());
const crm360Repository = new PrismaCrm360Repository();
const USER_ID = `user-${RUN_ID}`;

beforeAll(async () => {
    await withRlsBypass(() => prisma.organization.create({ data: { id: ORG, name: 'Test Org (deal closure)' } }));
});

afterEach(async () => {
    await withRlsBypass(async () => {
        await prisma.dealClosureEvent.deleteMany({ where: { organizationId: ORG } });
        await prisma.note.deleteMany({ where: { lead: { organizationId: ORG } } });
        await prisma.lead.deleteMany({ where: { organizationId: ORG } });
        await prisma.contact.deleteMany({ where: { organizationId: ORG } });
        await prisma.company.deleteMany({ where: { organizationId: ORG } });
    });
});

afterAll(async () => {
    await withRlsBypass(() => prisma.organization.deleteMany({ where: { id: ORG } }));
});

describe('CYC-007 — LeadUseCases.updateLeadStatus (Kanban drag)', () => {
    it('humano real: move o lead e grava Note + DealClosureEvent reais', async () => {
        const lead = await seedLead();

        const updated = await asOrg(ORG, () => leadUseCases.updateLeadStatus(ORG, lead.id, 'Negócios Ganhos', USER_ID));
        expect((updated as { status: string }).status).toBe('Negócios Ganhos');

        const events = await asOrg(ORG, () => prisma.dealClosureEvent.findMany({ where: { organizationId: ORG, leadId: lead.id } }));
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('ManualCrmConfirmation');
        expect(events[0].triggeredBy).toBe(USER_ID);

        const notes = await asOrg(ORG, () => prisma.note.findMany({ where: { leadId: lead.id } }));
        expect(notes).toHaveLength(1);
        expect(events[0].evidenceRef).toBe(notes[0].id);
    });

    it('sem actorUserId: rejeitado (401), lead não é movido', async () => {
        const lead = await seedLead();

        await expect(asOrg(ORG, () => leadUseCases.updateLeadStatus(ORG, lead.id, 'Negócios Ganhos', undefined))).rejects.toThrow();

        const untouched = await asOrg(ORG, () => prisma.lead.findUniqueOrThrow({ where: { id: lead.id } }));
        expect(untouched.status).not.toBe('Negocios_Ganhos');
    });

    it('actorUserId com cara de agente de IA: rejeitado (403), lead não é movido, nenhum evento nem nota gravados', async () => {
        const lead = await seedLead();

        await expect(
            asOrg(ORG, () => leadUseCases.updateLeadStatus(ORG, lead.id, 'Negócios Ganhos', 'agent:closer-swarm')),
        ).rejects.toThrow();

        const untouched = await asOrg(ORG, () => prisma.lead.findUniqueOrThrow({ where: { id: lead.id } }));
        expect(untouched.status).not.toBe('Negocios_Ganhos');

        const events = await asOrg(ORG, () => prisma.dealClosureEvent.findMany({ where: { organizationId: ORG, leadId: lead.id } }));
        expect(events).toHaveLength(0);

        // A checagem de triggeredBy roda antes de qualquer escrita: uma tentativa rejeitada nunca
        // deve deixar uma nota falsa de "confirmação manual" no histórico do lead.
        const notes = await asOrg(ORG, () => prisma.note.findMany({ where: { leadId: lead.id } }));
        expect(notes).toHaveLength(0);
    });

    it('mover para um status que NÃO é "Negócios Ganhos" nunca aciona o gate', async () => {
        const lead = await seedLead();

        await asOrg(ORG, () => leadUseCases.updateLeadStatus(ORG, lead.id, 'Qualificação (SDR)', undefined));

        const events = await asOrg(ORG, () => prisma.dealClosureEvent.findMany({ where: { organizationId: ORG, leadId: lead.id } }));
        expect(events).toHaveLength(0);
    });
});

describe('CYC-007 — LeadUseCases.updateLead (edição completa)', () => {
    it('humano real: move o lead via update completo e grava evidência real', async () => {
        const lead = await seedLead();

        await asOrg(ORG, () => leadUseCases.updateLead(ORG, lead.id, { status: 'Negócios Ganhos' } as never, USER_ID));

        const updated = await asOrg(ORG, () => prisma.lead.findUniqueOrThrow({ where: { id: lead.id } }));
        expect(updated.status).toBe('Negocios_Ganhos');

        const events = await asOrg(ORG, () => prisma.dealClosureEvent.findMany({ where: { organizationId: ORG, leadId: lead.id } }));
        expect(events).toHaveLength(1);
    });
});

describe('CYC-007 — PrismaCrm360Repository.updateLeadStage (módulo CRM360)', () => {
    it('humano real: mover para a etapa "Negócios Ganhos" grava evidência real', async () => {
        await asOrg(ORG, () => ensureDefaultPipelines(ORG));
        const lead = await seedLead();
        const wonStage = await asOrg(ORG, () =>
            prisma.crmPipelineStage.findFirstOrThrow({ where: { pipeline: { organizationId: ORG }, code: 'ganho' } }),
        );

        const updated = await asOrg(ORG, () => crm360Repository.updateLeadStage(ORG, lead.id, wonStage.id, undefined, USER_ID));
        expect((updated as { status: string }).status).toBe('Negócios Ganhos');

        const events = await asOrg(ORG, () => prisma.dealClosureEvent.findMany({ where: { organizationId: ORG, leadId: lead.id } }));
        expect(events).toHaveLength(1);
        expect(events[0].triggeredBy).toBe(USER_ID);
    });

    it('sem actorUserId: rejeitado, lead permanece na etapa original', async () => {
        await asOrg(ORG, () => ensureDefaultPipelines(ORG));
        const lead = await seedLead();
        const wonStage = await asOrg(ORG, () =>
            prisma.crmPipelineStage.findFirstOrThrow({ where: { pipeline: { organizationId: ORG }, code: 'ganho' } }),
        );

        await expect(asOrg(ORG, () => crm360Repository.updateLeadStage(ORG, lead.id, wonStage.id, undefined, undefined))).rejects.toThrow();

        const untouched = await asOrg(ORG, () => prisma.lead.findUniqueOrThrow({ where: { id: lead.id } }));
        expect(untouched.pipelineStageId).toBeNull();
    });

    it('mover para uma etapa que NÃO é "Negócios Ganhos" nunca aciona o gate', async () => {
        await asOrg(ORG, () => ensureDefaultPipelines(ORG));
        const lead = await seedLead();
        const openStage = await asOrg(ORG, () =>
            prisma.crmPipelineStage.findFirstOrThrow({ where: { pipeline: { organizationId: ORG }, code: 'nova-oportunidade' } }),
        );

        await asOrg(ORG, () => crm360Repository.updateLeadStage(ORG, lead.id, openStage.id, undefined, undefined));

        const events = await asOrg(ORG, () => prisma.dealClosureEvent.findMany({ where: { organizationId: ORG, leadId: lead.id } }));
        expect(events).toHaveLength(0);
    });
});
