import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// GOV-13 (onda 39): rotas novas para expor getLearningProfileHistory/rollbackLearningProfile
// (já existentes e testadas em learning.agent.versioning.test.ts) via HTTP — ver
// .agents/handoffs/onda-39/13-para-07-rota-rollback-learning-profile.md. Este teste trava a
// regressão da rota (auth, RBAC de escopo, mapeamento de erro); o versionamento em si é coberto
// no teste do agente.

const getLearningProfileHistoryMock = vi.fn();
const rollbackLearningProfileMock = vi.fn();

vi.mock('../../../../../src/features/intelligence/agents/learning.agent.js', () => ({
    LearningAgent: vi.fn(),
    getLearningProfileHistory: (...args: unknown[]) => getLearningProfileHistoryMock(...args),
    rollbackLearningProfile: (...args: unknown[]) => rollbackLearningProfileMock(...args),
}));

vi.mock('../../../../../src/features/intelligence/services/evaluationMetrics.service.js', () => ({
    getEvaluationMetricsSnapshot: vi.fn(),
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

import { agentRoutes } from '@/features/intelligence/routes/agent.routes';
import { errorHandler } from '@/shared/middlewares/errorHandler';

function buildApp(user = { id: 'user-1', organizationId: 'org-1', role: 'GESTOR' }) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        (req as unknown as { user: typeof user }).user = user;
        next();
    });
    app.use('/api/agent', agentRoutes);
    app.use(errorHandler);
    return app;
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('GET /api/agent/swarm/learn/history (GOV-13/onda-39)', () => {
    it('devolve o histórico do (tenant, ator) autenticado', async () => {
        const history = { activeVersion: 2, lastAuditLogAt: '2026-08-10T10:00:00.000Z', versions: [] };
        getLearningProfileHistoryMock.mockResolvedValue(history);

        const res = await request(buildApp()).get('/api/agent/swarm/learn/history');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, data: history });
        expect(getLearningProfileHistoryMock).toHaveBeenCalledWith('org-1', 'user-1');
    });

    it('tenant/ator vêm sempre de req.user, nunca de querystring', async () => {
        getLearningProfileHistoryMock.mockResolvedValue({ activeVersion: 0, lastAuditLogAt: null, versions: [] });

        await request(buildApp({ id: 'user-real', organizationId: 'org-real', role: 'ADMIN' }))
            .get('/api/agent/swarm/learn/history?organizationId=org-outra-tentativa&actorId=outro-user');

        expect(getLearningProfileHistoryMock).toHaveBeenCalledWith('org-real', 'user-real');
    });
});

describe('POST /api/agent/swarm/learn/rollback (GOV-13/onda-39)', () => {
    it('reverte para uma versão existente e devolve 200', async () => {
        rollbackLearningProfileMock.mockResolvedValue({ success: true, activeVersion: 1, guidelines: 'Estilo A' });

        const res = await request(buildApp()).post('/api/agent/swarm/learn/rollback').send({ targetVersion: 1 });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, data: { success: true, activeVersion: 1, guidelines: 'Estilo A' } });
        expect(rollbackLearningProfileMock).toHaveBeenCalledWith('org-1', 'user-1', 1);
    });

    it('versão inexistente devolve 404 com o motivo, sem lançar', async () => {
        rollbackLearningProfileMock.mockResolvedValue({ success: false, reason: 'Versão 9 não encontrada no histórico deste perfil.' });

        const res = await request(buildApp()).post('/api/agent/swarm/learn/rollback').send({ targetVersion: 9 });

        expect(res.status).toBe(404);
        expect(res.body).toEqual({ success: false, error: 'Versão 9 não encontrada no histórico deste perfil.' });
    });

    it('targetVersion ausente ou inválido devolve 400 sem chamar o serviço', async () => {
        const res = await request(buildApp()).post('/api/agent/swarm/learn/rollback').send({ targetVersion: 0 });

        expect(res.status).toBe(400);
        expect(rollbackLearningProfileMock).not.toHaveBeenCalled();
    });
});
