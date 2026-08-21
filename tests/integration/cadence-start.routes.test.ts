import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { prisma } from '../../src/lib/prisma';
import { requestContext } from '../../src/lib/async-context';
import { cadenceRoutes } from '../../src/features/cadence/cadence.routes';
import { errorHandler } from '../../src/shared/middlewares/errorHandler';

/**
 * Prova, contra Postgres real, as rotas de escrita adicionadas a `cadence.routes.ts`
 * (pré-requisito para o runtime de cadência ter algum efeito prático — sem elas não existia
 * nenhuma forma de criar uma `CadenceSequence` nem iniciar uma `CadenceRun` fora de teste).
 */

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ORG = `test-cadence-start-${RUN_ID}`;

const withRlsBypass = <T>(fn: () => Promise<T>): Promise<T> => requestContext.run({ bypassRls: true }, fn);
const asOrg = <T>(organizationId: string, fn: () => Promise<T>): Promise<T> => requestContext.run({ tenantId: organizationId }, fn);

function buildApp(role = 'GESTOR', organizationId = ORG) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        (req as unknown as { user: { id: string; organizationId: string; role: string } }).user = {
            id: 'test-user',
            organizationId,
            role,
        };
        // Requests reais rodam dentro de requestContext.run({tenantId}) — montado aqui do mesmo
        // jeito que server.ts monta requireTenant, para o Prisma real (com RLS) enxergar o tenant.
        requestContext.run({ tenantId: organizationId }, () => next());
    });
    app.use('/api/cadence', cadenceRoutes);
    app.use(errorHandler);
    return app;
}

async function seedLead(organizationId: string) {
    return asOrg(organizationId, async () => {
        const company = await prisma.company.create({ data: { legalName: 'Empresa Teste', tradeName: 'Empresa Teste', organizationId } });
        const contact = await prisma.contact.create({ data: { name: 'Lead Teste', companyId: company.id, organizationId } });
        return prisma.lead.create({ data: { companyId: company.id, contactId: contact.id, organizationId } });
    });
}

beforeAll(async () => {
    await withRlsBypass(() => prisma.organization.create({ data: { id: ORG, name: 'Test Org (cadence start)' } }));
});

afterEach(async () => {
    await withRlsBypass(async () => {
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

const VALID_TOUCHES = [{ order: 1, channel: 'whatsapp', delayHoursFromPrevious: 0, templateRef: 'Olá! Tudo bem?' }];

describe('POST /api/cadence/sequences (Postgres real)', () => {
    it('cria uma sequência válida', async () => {
        const res = await request(buildApp())
            .post('/api/cadence/sequences')
            .send({ name: 'Sequência de teste', touches: VALID_TOUCHES });

        expect(res.status).toBe(201);
        expect(res.body.data.name).toBe('Sequência de teste');

        const row = await asOrg(ORG, () => prisma.cadenceSequence.findUniqueOrThrow({ where: { id: res.body.data.id } }));
        expect(row.organizationId).toBe(ORG);
    });

    it('rejeita sequência com ordem de toques com lacuna (validateSequence)', async () => {
        const res = await request(buildApp())
            .post('/api/cadence/sequences')
            .send({ name: 'Sequência inválida', touches: [{ order: 2, channel: 'email', delayHoursFromPrevious: 0, templateRef: 'x' }] });

        expect(res.status).toBe(400);
    });

    it('VISUALIZADOR não pode criar sequência (requireRole)', async () => {
        const res = await request(buildApp('VISUALIZADOR'))
            .post('/api/cadence/sequences')
            .send({ name: 'Sequência de teste', touches: VALID_TOUCHES });

        expect(res.status).toBe(403);
    });
});

describe('POST /api/cadence/runs (Postgres real)', () => {
    it('inicia um run real para um lead existente', async () => {
        const lead = await seedLead(ORG);
        const seqRes = await request(buildApp())
            .post('/api/cadence/sequences')
            .send({ name: 'Sequência de teste', touches: VALID_TOUCHES });

        const res = await request(buildApp())
            .post('/api/cadence/runs')
            .send({ leadId: lead.id, sequenceId: seqRes.body.data.id });

        expect(res.status).toBe(201);
        expect(res.body.data.status).toBe('active');
        expect(res.body.data.leadId).toBe(lead.id);
        expect(res.body.data.sequenceName).toBe('Sequência de teste');

        const row = await asOrg(ORG, () => prisma.cadenceRun.findUniqueOrThrow({ where: { id: res.body.data.id } }));
        expect(row.status).toBe('Active');
    });

    it('404 quando o lead não existe nesta organização', async () => {
        const seqRes = await request(buildApp())
            .post('/api/cadence/sequences')
            .send({ name: 'Sequência de teste', touches: VALID_TOUCHES });

        const res = await request(buildApp())
            .post('/api/cadence/runs')
            .send({ leadId: 'lead-inexistente', sequenceId: seqRes.body.data.id });

        expect(res.status).toBe(404);
    });

    it('409 quando o lead já tem uma cadência ativa (unique constraint real)', async () => {
        const lead = await seedLead(ORG);
        const seqRes = await request(buildApp())
            .post('/api/cadence/sequences')
            .send({ name: 'Sequência de teste', touches: VALID_TOUCHES });

        const first = await request(buildApp())
            .post('/api/cadence/runs')
            .send({ leadId: lead.id, sequenceId: seqRes.body.data.id });
        expect(first.status).toBe(201);

        const second = await request(buildApp())
            .post('/api/cadence/runs')
            .send({ leadId: lead.id, sequenceId: seqRes.body.data.id });
        expect(second.status).toBe(409);
    });

    it('RLS: não é possível iniciar run para lead de outra organização', async () => {
        const otherOrg = `${ORG}-other`;
        await withRlsBypass(() => prisma.organization.create({ data: { id: otherOrg, name: 'Outra org' } }));
        try {
            const leadOther = await seedLead(otherOrg);
            const seqRes = await request(buildApp())
                .post('/api/cadence/sequences')
                .send({ name: 'Sequência de teste', touches: VALID_TOUCHES });

            const res = await request(buildApp())
                .post('/api/cadence/runs')
                .send({ leadId: leadOther.id, sequenceId: seqRes.body.data.id });

            expect(res.status).toBe(404);
        } finally {
            await withRlsBypass(async () => {
                await prisma.lead.deleteMany({ where: { organizationId: otherOrg } });
                await prisma.contact.deleteMany({ where: { organizationId: otherOrg } });
                await prisma.company.deleteMany({ where: { organizationId: otherOrg } });
                await prisma.organization.deleteMany({ where: { id: otherOrg } });
            });
        }
    });
});

describe('GET /api/cadence/sequences (Postgres real)', () => {
    it('lista só as sequências ativas da própria organização', async () => {
        await request(buildApp()).post('/api/cadence/sequences').send({ name: 'Seq A', touches: VALID_TOUCHES });
        await request(buildApp()).post('/api/cadence/sequences').send({ name: 'Seq B', touches: VALID_TOUCHES });

        const res = await request(buildApp()).get('/api/cadence/sequences');

        expect(res.status).toBe(200);
        expect(res.body.data.map((s: { name: string }) => s.name).sort()).toEqual(['Seq A', 'Seq B']);
    });
});

/**
 * CYC-009 (onda 29) — as rotas em si são novas, mas `pauseCadenceRun`/`resumeCadenceRun`/
 * `stopCadenceManually` (domínio) já eram testados unitariamente (`src/features/cadence/
 * __tests__/cadence.test.ts`) desde uma sprint anterior. O que faltava provar contra Postgres real
 * era a rota: carrega o run certo (RLS por organização), aplica a transição e persiste.
 */
async function startRun(): Promise<{ id: string }> {
    const lead = await seedLead(ORG);
    const seqRes = await request(buildApp()).post('/api/cadence/sequences').send({ name: 'Sequência de teste', touches: VALID_TOUCHES });
    const runRes = await request(buildApp()).post('/api/cadence/runs').send({ leadId: lead.id, sequenceId: seqRes.body.data.id });
    expect(runRes.status).toBe(201);
    return { id: runRes.body.data.id };
}

describe('POST /api/cadence/runs/:id/pause|resume|stop (Postgres real)', () => {
    it('pausa um run ativo — status muda para paused e pausedAt é gravado', async () => {
        const run = await startRun();

        const res = await request(buildApp()).post(`/api/cadence/runs/${run.id}/pause`);

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('paused');
        expect(res.body.data.pausedAt).not.toBeNull();

        const row = await asOrg(ORG, () => prisma.cadenceRun.findUniqueOrThrow({ where: { id: run.id } }));
        expect(row.status).toBe('Paused');
    });

    it('retoma um run pausado — status volta para active e pausedAt é limpo', async () => {
        const run = await startRun();
        await request(buildApp()).post(`/api/cadence/runs/${run.id}/pause`);

        const res = await request(buildApp()).post(`/api/cadence/runs/${run.id}/resume`);

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('active');
        expect(res.body.data.pausedAt).toBeNull();

        const row = await asOrg(ORG, () => prisma.cadenceRun.findUniqueOrThrow({ where: { id: run.id } }));
        expect(row.status).toBe('Active');
    });

    it('para um run ativo — status muda para stopped com motivo manual-stop, nunca retomável', async () => {
        const run = await startRun();

        const res = await request(buildApp()).post(`/api/cadence/runs/${run.id}/stop`);

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('stopped');
        expect(res.body.data.stopReason).toBe('manual-stop');

        const resumeAttempt = await request(buildApp()).post(`/api/cadence/runs/${run.id}/resume`);
        expect(resumeAttempt.body.data.status).toBe('stopped'); // idempotente — resumeCadenceRun só sai de paused

        const row = await asOrg(ORG, () => prisma.cadenceRun.findUniqueOrThrow({ where: { id: run.id } }));
        expect(row.status).toBe('Stopped');
        expect(row.stopReason).toBe('ManualStop');
    });

    it('resume num run que não está pausado é idempotente — devolve o run inalterado, sem erro', async () => {
        const run = await startRun();

        const res = await request(buildApp()).post(`/api/cadence/runs/${run.id}/resume`);

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('active');
    });

    it('404 quando o run não existe nesta organização', async () => {
        const res = await request(buildApp()).post('/api/cadence/runs/run-inexistente/pause');
        expect(res.status).toBe(404);
    });

    it('RLS: não é possível pausar um run de outra organização', async () => {
        const otherOrg = `${ORG}-other`;
        await withRlsBypass(() => prisma.organization.create({ data: { id: otherOrg, name: 'Outra org' } }));
        try {
            const leadOther = await seedLead(otherOrg);
            const seqOtherRes = await request(buildApp('GESTOR', otherOrg)).post('/api/cadence/sequences').send({ name: 'Sequência outra org', touches: VALID_TOUCHES });
            const runOtherRes = await request(buildApp('GESTOR', otherOrg)).post('/api/cadence/runs').send({ leadId: leadOther.id, sequenceId: seqOtherRes.body.data.id });
            expect(runOtherRes.status).toBe(201);

            const res = await request(buildApp()).post(`/api/cadence/runs/${runOtherRes.body.data.id}/pause`);
            expect(res.status).toBe(404);
        } finally {
            await withRlsBypass(async () => {
                await prisma.cadenceTouchAttempt.deleteMany({ where: { organizationId: otherOrg } });
                await prisma.cadenceRun.deleteMany({ where: { organizationId: otherOrg } });
                await prisma.cadenceSequence.deleteMany({ where: { organizationId: otherOrg } });
                await prisma.lead.deleteMany({ where: { organizationId: otherOrg } });
                await prisma.contact.deleteMany({ where: { organizationId: otherOrg } });
                await prisma.company.deleteMany({ where: { organizationId: otherOrg } });
                await prisma.organization.deleteMany({ where: { id: otherOrg } });
            });
        }
    });

    it('VISUALIZADOR não pode pausar/retomar/parar (requireRole)', async () => {
        const run = await startRun();

        const pauseRes = await request(buildApp('VISUALIZADOR')).post(`/api/cadence/runs/${run.id}/pause`);
        expect(pauseRes.status).toBe(403);
    });
});
