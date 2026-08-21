import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { prisma } from '../../src/lib/prisma';
import { requestContext } from '../../src/lib/async-context';
import { cadenceRoutes } from '../../src/features/cadence/cadence.routes';
import { errorHandler } from '../../src/shared/middlewares/errorHandler';

/**
 * CYC-004 (onda 27) — prova, contra Postgres real, que `POST
 * /api/cadence/leads/:leadId/schedule-meeting` conecta o domínio `scheduling.ts` (guardrails
 * anti-inferência-de-IA, entregue numa sprint anterior sem nenhum caller de produção) a um
 * caminho de escrita real: `CadenceCalendarEvent` sai da lista de tabelas mortas confirmadas em
 * `docs/CADENCE-CYCLE-AUDIT.md`.
 */

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ORG = `test-schedule-meeting-${RUN_ID}`;

const withRlsBypass = <T>(fn: () => Promise<T>): Promise<T> => requestContext.run({ bypassRls: true }, fn);
const asOrg = <T>(organizationId: string, fn: () => Promise<T>): Promise<T> => requestContext.run({ tenantId: organizationId }, fn);

function buildApp(role = 'GESTOR', organizationId = ORG) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        (req as unknown as { user: { id: string; email: string; organizationId: string; role: string } }).user = {
            id: 'test-user',
            email: 'vendedor@atlasgr.com.br',
            organizationId,
            role,
        };
        requestContext.run({ tenantId: organizationId }, () => next());
    });
    app.use('/api/cadence', cadenceRoutes);
    app.use(errorHandler);
    return app;
}

async function seedLead(organizationId: string, contactEmail: string | null = 'contato@exemplo.com') {
    return asOrg(organizationId, async () => {
        const company = await prisma.company.create({ data: { legalName: 'Empresa Teste', tradeName: 'Empresa Teste', organizationId } });
        const contact = await prisma.contact.create({ data: { name: 'Lead Teste', email: contactEmail, companyId: company.id, organizationId } });
        return prisma.lead.create({ data: { companyId: company.id, contactId: contact.id, organizationId, title: 'Empresa Teste' } });
    });
}

beforeAll(async () => {
    await withRlsBypass(() => prisma.organization.create({ data: { id: ORG, name: 'Test Org (schedule meeting)' } }));
});

afterEach(async () => {
    await withRlsBypass(async () => {
        await prisma.cadenceCalendarEvent.deleteMany({ where: { organizationId: ORG } });
        await prisma.note.deleteMany({ where: { lead: { organizationId: ORG } } });
        await prisma.cadenceTouchAttempt.deleteMany({ where: { organizationId: ORG } });
        await prisma.cadenceRun.deleteMany({ where: { organizationId: ORG } });
        await prisma.cadenceSequence.deleteMany({ where: { organizationId: ORG } });
        await prisma.lead.deleteMany({ where: { organizationId: ORG } });
        await prisma.contact.deleteMany({ where: { organizationId: ORG } });
        await prisma.company.deleteMany({ where: { organizationId: ORG } });
    });
});

afterAll(async () => {
    await withRlsBypass(() => prisma.organization.deleteMany({ where: { id: ORG } }));
});

const FUTURE_START = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const FUTURE_END = new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString();

describe('POST /api/cadence/leads/:leadId/schedule-meeting (Postgres real)', () => {
    it('confirmação manual válida: cria a Note de evidência e o CadenceCalendarEvent real', async () => {
        const lead = await seedLead(ORG);

        const res = await request(buildApp())
            .post(`/api/cadence/leads/${lead.id}/schedule-meeting`)
            .send({ proposedStart: FUTURE_START, proposedEnd: FUTURE_END });

        expect(res.status).toBe(201);
        expect(res.body.data.scheduled).toBe(true);
        expect(res.body.data.googleEventId).toMatch(/^fallback-event-/);
        expect(res.body.data.noteId).toBeTruthy();

        const event = await asOrg(ORG, () => prisma.cadenceCalendarEvent.findFirstOrThrow({ where: { leadId: lead.id } }));
        expect(event.organizationId).toBe(ORG);
        expect(event.confirmationEvidenceType).toBe('ManualVerified');
        expect(event.confirmationEvidenceRef).toBe(res.body.data.noteId);
        expect(event.cadenceRunId).toBeNull();
        expect(event.ownerUserId).toBe('test-user');

        const note = await asOrg(ORG, () => prisma.note.findUniqueOrThrow({ where: { id: res.body.data.noteId } }));
        expect(note.leadId).toBe(lead.id);
        expect(note.author).toBe('test-user');
        expect(note.content).toContain('Reunião comercial confirmada manualmente');
    });

    it('lead sem e-mail de contato: agenda mesmo assim (o convidado do lead só é omitido, nunca bloqueia)', async () => {
        const lead = await seedLead(ORG, null);

        const res = await request(buildApp())
            .post(`/api/cadence/leads/${lead.id}/schedule-meeting`)
            .send({ proposedStart: FUTURE_START, proposedEnd: FUTURE_END });

        expect(res.status).toBe(201);
        expect(res.body.data.scheduled).toBe(true);
    });

    it('vincula o CadenceRun ativo do lead quando existe', async () => {
        const lead = await seedLead(ORG);
        const seqRes = await request(buildApp())
            .post('/api/cadence/sequences')
            .send({ name: 'Sequência de teste', touches: [{ order: 1, channel: 'whatsapp', delayHoursFromPrevious: 0, templateRef: 'Olá!' }] });
        const runRes = await request(buildApp())
            .post('/api/cadence/runs')
            .send({ leadId: lead.id, sequenceId: seqRes.body.data.id });
        expect(runRes.status).toBe(201);

        const res = await request(buildApp())
            .post(`/api/cadence/leads/${lead.id}/schedule-meeting`)
            .send({ proposedStart: FUTURE_START, proposedEnd: FUTURE_END });

        expect(res.status).toBe(201);
        const event = await asOrg(ORG, () => prisma.cadenceCalendarEvent.findFirstOrThrow({ where: { leadId: lead.id } }));
        expect(event.cadenceRunId).toBe(runRes.body.data.id);
    });

    it('422 quando o horário proposto já passou — nenhuma Note nem CadenceCalendarEvent é criado', async () => {
        const lead = await seedLead(ORG);
        const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();

        const res = await request(buildApp())
            .post(`/api/cadence/leads/${lead.id}/schedule-meeting`)
            .send({ proposedStart: past, proposedEnd: FUTURE_END });

        expect(res.status).toBe(422);

        const events = await asOrg(ORG, () => prisma.cadenceCalendarEvent.findMany({ where: { leadId: lead.id } }));
        const notes = await asOrg(ORG, () => prisma.note.findMany({ where: { leadId: lead.id } }));
        expect(events).toHaveLength(0);
        expect(notes).toHaveLength(0);
    });

    it('400 quando proposedStart/proposedEnd não são ISO 8601 válidos', async () => {
        const lead = await seedLead(ORG);

        const res = await request(buildApp())
            .post(`/api/cadence/leads/${lead.id}/schedule-meeting`)
            .send({ proposedStart: 'não é uma data', proposedEnd: FUTURE_END });

        expect(res.status).toBe(400);
    });

    it('404 quando o lead não existe nesta organização', async () => {
        const res = await request(buildApp())
            .post('/api/cadence/leads/lead-inexistente/schedule-meeting')
            .send({ proposedStart: FUTURE_START, proposedEnd: FUTURE_END });

        expect(res.status).toBe(404);
    });

    it('RLS: não é possível agendar reunião para lead de outra organização', async () => {
        const otherOrg = `${ORG}-other`;
        await withRlsBypass(() => prisma.organization.create({ data: { id: otherOrg, name: 'Outra org' } }));
        try {
            const leadOther = await seedLead(otherOrg);

            const res = await request(buildApp())
                .post(`/api/cadence/leads/${leadOther.id}/schedule-meeting`)
                .send({ proposedStart: FUTURE_START, proposedEnd: FUTURE_END });

            expect(res.status).toBe(404);
        } finally {
            await withRlsBypass(async () => {
                await prisma.cadenceCalendarEvent.deleteMany({ where: { organizationId: otherOrg } });
                await prisma.note.deleteMany({ where: { lead: { organizationId: otherOrg } } });
                await prisma.lead.deleteMany({ where: { organizationId: otherOrg } });
                await prisma.contact.deleteMany({ where: { organizationId: otherOrg } });
                await prisma.company.deleteMany({ where: { organizationId: otherOrg } });
                await prisma.organization.deleteMany({ where: { id: otherOrg } });
            });
        }
    });

    it('VISUALIZADOR não pode agendar reunião (requireRole)', async () => {
        const lead = await seedLead(ORG);

        const res = await request(buildApp('VISUALIZADOR'))
            .post(`/api/cadence/leads/${lead.id}/schedule-meeting`)
            .send({ proposedStart: FUTURE_START, proposedEnd: FUTURE_END });

        expect(res.status).toBe(403);
    });
});
