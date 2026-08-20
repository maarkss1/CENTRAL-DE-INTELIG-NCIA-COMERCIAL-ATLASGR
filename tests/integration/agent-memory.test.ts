import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { prisma } from '../../src/lib/prisma';
import { requestContext } from '../../src/lib/async-context';
import { intelligenceRoutes } from '../../src/features/intelligence/routes/intelligence.routes';
import { errorHandler } from '../../src/shared/middlewares/errorHandler';
import {
    saveAgentMemory,
    loadAgentMemory,
    recordAgentFailure,
} from '../../src/features/intelligence/agents/agentMemory.store';

/**
 * AI-003 (onda 31) contra Postgres real: prova as duas garantias que um teste com prisma mockado
 * não consegue provar — que a unique constraint (sessionId, agentType, organizationId) realmente
 * impede duas linhas para a mesma sessão sob escrita concorrente, e que o contrato de 3 estados de
 * GET /agents/sdr/status/:sessionId (pending/completed/failed) funciona de ponta a ponta.
 */

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ORG = `test-agent-memory-${RUN_ID}`;

const withRlsBypass = <T>(fn: () => Promise<T>): Promise<T> => requestContext.run({ bypassRls: true }, fn);
const asOrg = <T>(organizationId: string, fn: () => Promise<T>): Promise<T> => requestContext.run({ tenantId: organizationId }, fn);

function buildApp(organizationId = ORG) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        (req as unknown as { user: { id: string; organizationId: string; role: string } }).user = {
            id: 'test-user',
            organizationId,
            role: 'GESTOR',
        };
        requestContext.run({ tenantId: organizationId }, () => next());
    });
    app.use('/api/intelligence', intelligenceRoutes);
    app.use(errorHandler);
    return app;
}

async function cleanupAgentMemory() {
    await withRlsBypass(() =>
        prisma.agentMemory.deleteMany({ where: { organizationId: ORG } }),
    );
}

beforeAll(async () => {
    await withRlsBypass(() => prisma.organization.create({ data: { id: ORG, name: 'Test Org (agent memory)' } }));
});

afterEach(cleanupAgentMemory);

afterAll(async () => {
    await cleanupAgentMemory();
    await withRlsBypass(() => prisma.organization.deleteMany({ where: { id: ORG } }));
});

describe('agentMemory.store — upsert atômico (Postgres real)', () => {
    it('escritas concorrentes para a mesma sessão nunca duplicam a linha', async () => {
        const sessionId = `race-${RUN_ID}`;

        await asOrg(ORG, () =>
            Promise.all(
                Array.from({ length: 10 }, (_, i) =>
                    saveAgentMemory({
                        sessionId,
                        agentType: 'SDR',
                        organizationId: ORG,
                        messages: [{ role: 'assistant', content: `turno ${i}` }],
                        status: 'Completed',
                    }),
                ),
            ),
        );

        const rows = await withRlsBypass(() =>
            prisma.agentMemory.findMany({ where: { sessionId, agentType: 'SDR', organizationId: ORG } }),
        );
        expect(rows).toHaveLength(1);
    });

    it('upsert sobrescreve o estado anterior (failed → completed)', async () => {
        const sessionId = `overwrite-${RUN_ID}`;

        await asOrg(ORG, async () => {
            await recordAgentFailure({ sessionId, agentType: 'SDR', organizationId: ORG, errorMessage: 'erro transitório' });
            await saveAgentMemory({
                sessionId,
                agentType: 'SDR',
                organizationId: ORG,
                messages: [{ role: 'assistant', content: 'sucesso na segunda tentativa' }],
                status: 'Completed',
            });
        });

        const memory = await asOrg(ORG, () => loadAgentMemory({ sessionId, agentType: 'SDR', organizationId: ORG }));
        expect(memory?.status).toBe('Completed');
        expect(memory?.errorMessage).toBeNull();
        expect(memory?.messages).toEqual([{ role: 'assistant', content: 'sucesso na segunda tentativa' }]);

        const rows = await withRlsBypass(() =>
            prisma.agentMemory.findMany({ where: { sessionId, agentType: 'SDR', organizationId: ORG } }),
        );
        expect(rows).toHaveLength(1);
    });

    it('trunca mensagem de erro além de 500 caracteres', async () => {
        const sessionId = `truncate-${RUN_ID}`;
        const longMessage = 'x'.repeat(1000);

        await asOrg(ORG, () =>
            recordAgentFailure({ sessionId, agentType: 'SDR', organizationId: ORG, errorMessage: longMessage }),
        );

        const memory = await asOrg(ORG, () => loadAgentMemory({ sessionId, agentType: 'SDR', organizationId: ORG }));
        expect(memory?.errorMessage?.length).toBeLessThanOrEqual(501);
        expect(memory?.status).toBe('Failed');
    });

    it('recordAgentFailure nunca lança, mesmo se a escrita falhar', async () => {
        // organizationId vazio força o Prisma a rejeitar (campo obrigatório na tabela relacionada
        // não existe) — o ponto é só confirmar que o helper engole e não propaga.
        await expect(
            recordAgentFailure({ sessionId: 'x', agentType: 'SDR', organizationId: 'org-inexistente-xyz', errorMessage: 'erro' }),
        ).resolves.toBeUndefined();
    });
});

describe('GET /api/intelligence/agents/sdr/status/:sessionId — contrato de 3 estados (Postgres real)', () => {
    it('devolve 202 pending quando não há registro para a sessão', async () => {
        const app = buildApp();
        const res = await request(app).get('/api/intelligence/agents/sdr/status/sessao-nunca-existiu');

        expect(res.status).toBe(202);
        expect(res.body).toMatchObject({ status: 'pending', sessionId: 'sessao-nunca-existiu' });
    });

    it('devolve 200 completed com as mensagens quando a execução terminou com sucesso', async () => {
        const sessionId = `status-completed-${RUN_ID}`;
        await asOrg(ORG, () =>
            saveAgentMemory({
                sessionId,
                agentType: 'SDR',
                organizationId: ORG,
                messages: [{ role: 'assistant', content: 'qualificação concluída' }],
                status: 'Completed',
            }),
        );

        const app = buildApp();
        const res = await request(app).get(`/api/intelligence/agents/sdr/status/${sessionId}`);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            status: 'completed',
            sessionId,
            messages: [{ role: 'assistant', content: 'qualificação concluída' }],
        });
    });

    it('devolve 200 failed com o motivo quando a execução falhou (bloqueio LGPD/erro de grafo)', async () => {
        const sessionId = `status-failed-${RUN_ID}`;
        await asOrg(ORG, () =>
            recordAgentFailure({
                sessionId,
                agentType: 'SDR',
                organizationId: ORG,
                errorMessage: 'Sem base legal LGPD registrada.',
            }),
        );

        const app = buildApp();
        const res = await request(app).get(`/api/intelligence/agents/sdr/status/${sessionId}`);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            status: 'failed',
            sessionId,
            error: 'Sem base legal LGPD registrada.',
        });
    });

    it('RLS: não enxerga a sessão de outra organização (continua pending do ponto de vista dela)', async () => {
        const otherOrg = `test-agent-memory-other-${RUN_ID}`;
        const sessionId = `status-cross-org-${RUN_ID}`;
        await withRlsBypass(() => prisma.organization.create({ data: { id: otherOrg, name: 'Other Org' } }));

        try {
            await asOrg(otherOrg, () =>
                saveAgentMemory({
                    sessionId,
                    agentType: 'SDR',
                    organizationId: otherOrg,
                    messages: [{ role: 'assistant', content: 'não deveria aparecer para ORG' }],
                    status: 'Completed',
                }),
            );

            const app = buildApp(ORG);
            const res = await request(app).get(`/api/intelligence/agents/sdr/status/${sessionId}`);

            expect(res.status).toBe(202);
            expect(res.body).toMatchObject({ status: 'pending', sessionId });
        } finally {
            await withRlsBypass(() => prisma.agentMemory.deleteMany({ where: { organizationId: otherOrg } }));
            await withRlsBypass(() => prisma.organization.deleteMany({ where: { id: otherOrg } }));
        }
    });
});
