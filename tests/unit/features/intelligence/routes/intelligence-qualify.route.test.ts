/**
 * POST /api/intelligence/qualify — QUEUE-002: o job enfileirado precisa carregar `organizationId`
 * (sem ele, `createLeadsWorker` não tem como escopar a atualização do lead por tenant sob RLS — ver
 * tests/unit/lib/queue/leadsWorker.test.ts) e um `jobId` determinístico por tenant+lead, para um
 * clique duplo (ou um segundo pedido antes do primeiro terminar) reaproveitar o job em vez de
 * duplicar a chamada de IA e correr duas atualizações concorrentes do mesmo lead.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const getJobMock = vi.fn();
const addMock = vi.fn();
vi.mock('@/lib/queue/index', () => ({
    leadsQueue: { getJob: (...args: unknown[]) => getJobMock(...args), add: (...args: unknown[]) => addMock(...args) },
}));

vi.mock('@/features/intelligence/services/ai-settings.service', () => ({
    listAiSettings: vi.fn(), saveAiSettings: vi.fn(),
}));
vi.mock('@/features/intelligence/services/pending-actions.service', () => ({
    listPendingActions: vi.fn(), approvePendingAction: vi.fn(), discardPendingAction: vi.fn(),
}));

import { intelligenceRoutes } from '@/features/intelligence/routes/intelligence.routes';
import { errorHandler } from '@/shared/middlewares/errorHandler';

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        (req as unknown as { user: { id: string; organizationId: string; role: string } }).user = {
            id: 'test-user', organizationId: 'org-1', role: 'VENDEDOR',
        };
        next();
    });
    app.use('/api/intelligence', intelligenceRoutes);
    app.use(errorHandler);
    return app;
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('POST /api/intelligence/qualify', () => {
    it('enfileira o job com organizationId e um jobId determinístico por tenant+lead', async () => {
        getJobMock.mockResolvedValue(undefined);
        addMock.mockResolvedValue({ id: 'qualify-lead:org-1:lead-1' });

        const res = await request(buildApp())
            .post('/api/intelligence/qualify')
            .send({ leadId: 'lead-1', companyInfo: 'Transportadora X' });

        expect(res.status).toBe(202);
        expect(addMock).toHaveBeenCalledWith(
            'qualify-lead',
            { leadId: 'lead-1', companyInfo: 'Transportadora X', organizationId: 'org-1' },
            { jobId: 'qualify-lead:org-1:lead-1' },
        );
    });

    it('reaproveita o job já em fila/execução em vez de enfileirar de novo (idempotência)', async () => {
        const existingJob = { id: 'qualify-lead:org-1:lead-1', getState: vi.fn().mockResolvedValue('active') };
        getJobMock.mockResolvedValue(existingJob);

        const res = await request(buildApp())
            .post('/api/intelligence/qualify')
            .send({ leadId: 'lead-1' });

        expect(res.status).toBe(202);
        expect(res.body.jobId).toBe('qualify-lead:org-1:lead-1');
        expect(addMock).not.toHaveBeenCalled();
    });

    it('remove um job terminal (completed/failed) antes de enfileirar de novo — nunca colide com o TTL de retenção', async () => {
        const remove = vi.fn().mockResolvedValue(undefined);
        const existingJob = { id: 'qualify-lead:org-1:lead-1', getState: vi.fn().mockResolvedValue('completed'), remove };
        getJobMock.mockResolvedValue(existingJob);
        addMock.mockResolvedValue({ id: 'qualify-lead:org-1:lead-1' });

        const res = await request(buildApp())
            .post('/api/intelligence/qualify')
            .send({ leadId: 'lead-1' });

        expect(res.status).toBe(202);
        expect(remove).toHaveBeenCalledTimes(1);
        expect(addMock).toHaveBeenCalledTimes(1);
    });

    it('recusa sem leadId', async () => {
        const res = await request(buildApp()).post('/api/intelligence/qualify').send({});
        expect(res.status).toBe(400);
        expect(addMock).not.toHaveBeenCalled();
    });
});
