import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// AI-005 (onda 36): trava a regressão da rota GET /api/agent/golden-dataset/summary. O conteúdo
// real do dataset é coberto separadamente em
// src/features/intelligence/evaluation/__tests__/goldenDataset.service.test.ts.

const getDatasetSummaryMock = vi.fn();
const validateToolUseCasesMock = vi.fn();

vi.mock('../../../../../src/features/intelligence/evaluation/goldenDataset.service.js', () => ({
    getDatasetSummary: (...args: unknown[]) => getDatasetSummaryMock(...args),
    validateToolUseCases: (...args: unknown[]) => validateToolUseCasesMock(...args),
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
vi.mock('../../../../../src/features/intelligence/agents/learning.agent.js', () => ({
    LearningAgent: vi.fn(),
}));

import { agentRoutes } from '@/features/intelligence/routes/agent.routes';
import { errorHandler } from '@/shared/middlewares/errorHandler';

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        (req as unknown as { user: { id: string; organizationId: string; role: string } }).user = {
            id: 'test-user',
            organizationId: 'org-1',
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

describe('GET /api/agent/golden-dataset/summary (AI-005/onda-36)', () => {
    it('devolve o resumo do dataset e a validação real dos casos tool_use', async () => {
        const summary = { version: '2026-08-20.1', generatedAt: '2026-08-20T00:00:00.000Z', totalCases: 24, countByCategory: {} };
        const toolUseValidation = [{ caseId: 'tool_use-001', valid: true }];
        getDatasetSummaryMock.mockReturnValue(summary);
        validateToolUseCasesMock.mockResolvedValue(toolUseValidation);

        const res = await request(buildApp()).get('/api/agent/golden-dataset/summary');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ summary, toolUseValidation });
    });

    it('propaga uma falha de validação (ex.: dataset malformado) como 500, não engole o erro', async () => {
        getDatasetSummaryMock.mockImplementation(() => {
            throw new Error('Dataset malformado');
        });

        const res = await request(buildApp()).get('/api/agent/golden-dataset/summary');

        expect(res.status).toBe(500);
    });
});
