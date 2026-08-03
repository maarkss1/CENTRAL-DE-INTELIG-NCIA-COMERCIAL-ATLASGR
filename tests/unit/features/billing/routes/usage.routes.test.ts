/**
 * Cobre a rota GET /api/usage — consumo de IA da organização (não é faturamento: ver
 * src/features/billing/usage.service.ts). O foco aqui é o contrato HTTP: normalização de `days`,
 * escopo por organização vinda do middleware de auth e propagação de erro pro errorHandler global.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { http, passthrough } from 'msw';
// O supertest sobe o app express num socket TCP real (127.0.0.1:porta aleatória). O MSW global
// (TEST-004, tests/mocks/setup.ts) intercepta toda requisição HTTP do processo com estratégia
// "error" para o que não tem handler — sem isso aqui, a chamada do supertest é barrada antes de
// chegar na rota. `passthrough()` deixa essa requisição específica seguir pra rede real local.
import { server } from '../../../../mocks/server';

const summaryMock = vi.fn();

vi.mock('@/features/billing/usage.service', () => ({
    usageService: { summary: (...args: unknown[]) => summaryMock(...args) },
}));

import { usageRoutes } from '@/features/billing/usage.routes';
import { errorHandler } from '@/shared/middlewares/errorHandler';

function buildApp(organizationId = 'test-org-id') {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        (req as unknown as { user: { id: string; organizationId: string; role: string } }).user = {
            id: 'test-user',
            organizationId,
            role: 'ADMIN',
        };
        next();
    });
    app.use('/api/usage', usageRoutes);
    app.use(errorHandler);
    return app;
}

const summaryFixture = {
    totalTokens: 1000,
    totalCost: 1.5,
    totalCalls: 5,
    avgLatencyMs: 300,
    costThisMonth: 0.5,
    byModel: [],
    daily: [],
    unattributedCalls: 0,
    isEmpty: false,
};

beforeEach(() => {
    vi.clearAllMocks();
    summaryMock.mockResolvedValue(summaryFixture);
    server.use(http.get(/^http:\/\/127\.0\.0\.1:\d+\/api\/usage/, () => passthrough()));
});

describe('usage routes', () => {
    it('GET /api/usage devolve o resumo de consumo da organização autenticada', async () => {
        const app = buildApp('org-42');
        const res = await request(app).get('/api/usage');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, data: summaryFixture });
        expect(summaryMock).toHaveBeenCalledWith('org-42', 30);
    });

    it('repassa o parâmetro days informado', async () => {
        const app = buildApp();
        await request(app).get('/api/usage?days=7');
        expect(summaryMock).toHaveBeenCalledWith('test-org-id', 7);
    });

    it('usa 30 dias quando days não é um número', async () => {
        const app = buildApp();
        await request(app).get('/api/usage?days=abc');
        expect(summaryMock).toHaveBeenCalledWith('test-org-id', 30);
    });

    it('satura no mínimo de 7 dias', async () => {
        const app = buildApp();
        await request(app).get('/api/usage?days=1');
        expect(summaryMock).toHaveBeenCalledWith('test-org-id', 7);
    });

    it('satura no máximo de 90 dias', async () => {
        const app = buildApp();
        await request(app).get('/api/usage?days=365');
        expect(summaryMock).toHaveBeenCalledWith('test-org-id', 90);
    });

    it('propaga erro do service pro error handler global em vez de derrubar a requisição', async () => {
        summaryMock.mockRejectedValue(new Error('Banco indisponível'));
        const app = buildApp();

        const res = await request(app).get('/api/usage');

        expect(res.status).toBe(500);
        expect(res.body.success).toBe(false);
    });
});
