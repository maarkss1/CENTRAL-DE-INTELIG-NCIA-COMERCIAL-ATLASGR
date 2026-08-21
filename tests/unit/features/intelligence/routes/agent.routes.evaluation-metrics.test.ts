import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// AI-006 (onda 35): rota nova, mesmo padrão de validação/organizationId de /swarm/slo (AI-009).
// Este teste trava a regressão da rota; o cálculo real das 9 dimensões é coberto separadamente em
// src/features/intelligence/services/__tests__/evaluationMetrics.service.test.ts.

const getEvaluationMetricsSnapshotMock = vi.fn();

vi.mock('../../../../../src/features/intelligence/services/evaluationMetrics.service.js', () => ({
    getEvaluationMetricsSnapshot: (...args: unknown[]) => getEvaluationMetricsSnapshotMock(...args),
}));

vi.mock('../../../../../src/features/intelligence/services/swarmScheduler.service.js', () => ({
    getSwarmSloSnapshot: vi.fn(),
}));
vi.mock('../../../../../src/lib/ai/gateway.js', () => ({
    getAiModel: vi.fn(),
    logAiUsage: vi.fn(),
}));
vi.mock('../../../../../src/features/intelligence/services/guardrails.service.js', () => ({
    redactAndTrackPiiLeak: vi.fn(async (text: string) => text),
}));
vi.mock('../../../../../src/features/intelligence/services/voicebox.service.js', () => ({
    synthesizeSpeech: vi.fn(),
}));
vi.mock('../../../../../src/features/intelligence/agents/supervisor.agent.js', () => ({
    SwarmOrchestrator: vi.fn(),
}));
vi.mock('../../../../../src/features/intelligence/agents/learning.agent.js', () => ({
    LearningAgent: vi.fn(),
}));

import { agentRoutes } from '@/features/intelligence/routes/agent.routes';
import { errorHandler } from '@/shared/middlewares/errorHandler';

function buildApp(organizationId = 'org-1') {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        (req as unknown as { user: { id: string; organizationId: string; role: string } }).user = {
            id: 'test-user',
            organizationId,
            role: 'GESTOR',
        };
        next();
    });
    app.use('/api/agent', agentRoutes);
    app.use(errorHandler);
    return app;
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('GET /api/agent/evaluation-metrics (AI-006/onda-35)', () => {
    it('devolve o snapshot das 9 dimensões da organização autenticada, com days default 30', async () => {
        const snapshot = { organizationId: 'org-1', windowDays: 30, generatedAt: '2026-08-20T00:00:00Z', dimensions: {} };
        getEvaluationMetricsSnapshotMock.mockResolvedValue(snapshot);

        const res = await request(buildApp('org-1')).get('/api/agent/evaluation-metrics');

        expect(res.status).toBe(200);
        expect(res.body).toEqual(snapshot);
        expect(getEvaluationMetricsSnapshotMock).toHaveBeenCalledWith('org-1', 30);
    });

    it('repassa days da querystring', async () => {
        getEvaluationMetricsSnapshotMock.mockResolvedValue({ organizationId: 'org-1', windowDays: 7, generatedAt: '', dimensions: {} });

        const res = await request(buildApp('org-1')).get('/api/agent/evaluation-metrics?days=7');

        expect(res.status).toBe(200);
        expect(getEvaluationMetricsSnapshotMock).toHaveBeenCalledWith('org-1', 7);
    });

    it('days fora de 1-90 devolve 400 sem chamar o serviço', async () => {
        const res = await request(buildApp('org-1')).get('/api/agent/evaluation-metrics?days=91');

        expect(res.status).toBe(400);
        expect(getEvaluationMetricsSnapshotMock).not.toHaveBeenCalled();
    });

    it('organizationId vem sempre de req.user, nunca de querystring', async () => {
        getEvaluationMetricsSnapshotMock.mockResolvedValue({ organizationId: 'org-real', windowDays: 30, generatedAt: '', dimensions: {} });

        await request(buildApp('org-real')).get('/api/agent/evaluation-metrics?organizationId=org-outra-tentativa');

        expect(getEvaluationMetricsSnapshotMock).toHaveBeenCalledWith('org-real', 30);
    });
});
