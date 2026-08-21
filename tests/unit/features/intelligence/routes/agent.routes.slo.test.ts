import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// AI-009 (Sprint 07/onda-20): a fonte de dados (getSwarmSloSnapshot) e a UI (SwarmDashboard.tsx)
// existiam desde a onda 7, mas a rota GET /api/agent/swarm/slo nunca foi registrada (ver
// .agents/handoffs/onda-7/13-para-07-rota-slo-swarm.md). Este teste trava a regressão.

const getSwarmSloSnapshotMock = vi.fn();

vi.mock('../../../../../src/features/intelligence/services/swarmScheduler.service.js', () => ({
    getSwarmSloSnapshot: (...args: unknown[]) => getSwarmSloSnapshotMock(...args),
}));

vi.mock('../../../../../src/lib/ai/gateway.js', () => ({
    getAiModel: vi.fn(),
    logAiUsage: vi.fn(),
}));
vi.mock('../../../../../src/features/intelligence/services/guardrails.service.js', () => ({
    redactAndTrackPiiLeak: vi.fn(async (text: string) => text),
}));
vi.mock('../../../../../src/features/intelligence/services/evaluationMetrics.service.js', () => ({
    getEvaluationMetricsSnapshot: vi.fn(),
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

describe('GET /api/agent/swarm/slo (AI-009/onda-20)', () => {
    it('devolve o snapshot de SLO da organização autenticada, com days default 30', async () => {
        const snapshot = { organizationId: 'org-1', windowDays: 30, generatedAt: '2026-08-19T00:00:00Z', agents: [], cost: {} };
        getSwarmSloSnapshotMock.mockResolvedValue(snapshot);

        const res = await request(buildApp('org-1')).get('/api/agent/swarm/slo');

        expect(res.status).toBe(200);
        expect(res.body).toEqual(snapshot);
        expect(getSwarmSloSnapshotMock).toHaveBeenCalledWith('org-1', 30);
    });

    it('repassa days da querystring', async () => {
        getSwarmSloSnapshotMock.mockResolvedValue({ organizationId: 'org-1', windowDays: 7, generatedAt: '', agents: [], cost: {} });

        const res = await request(buildApp('org-1')).get('/api/agent/swarm/slo?days=7');

        expect(res.status).toBe(200);
        expect(getSwarmSloSnapshotMock).toHaveBeenCalledWith('org-1', 7);
    });

    it('days fora de 1-90 devolve 400 sem chamar o serviço', async () => {
        const res = await request(buildApp('org-1')).get('/api/agent/swarm/slo?days=91');

        expect(res.status).toBe(400);
        expect(getSwarmSloSnapshotMock).not.toHaveBeenCalled();
    });

    it('organizationId vem sempre de req.user, nunca de querystring', async () => {
        getSwarmSloSnapshotMock.mockResolvedValue({ organizationId: 'org-real', windowDays: 30, generatedAt: '', agents: [], cost: {} });

        await request(buildApp('org-real')).get('/api/agent/swarm/slo?organizationId=org-outra-tentativa');

        expect(getSwarmSloSnapshotMock).toHaveBeenCalledWith('org-real', 30);
    });
});
