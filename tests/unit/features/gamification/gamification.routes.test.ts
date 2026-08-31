/**
 * Cobre a rota POST /api/gamification/coaching/weekly — coaching semanal por IA do vendedor
 * autenticado (Piloto 007, .claude/PILOTS.md). Foco: o nome/organização usados vêm sempre da
 * sessão autenticada (nunca do body), um role inválido no body é ignorado, e erros propagam pro
 * error handler global.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { http, passthrough } from 'msw';
import { server } from '../../../mocks/server';

const computeMock = vi.fn();
const generateCoachingReportMock = vi.fn();
const findUniqueMock = vi.fn();

vi.mock('@/features/gamification/services/sellerPerformanceAggregator.service', () => ({
    sellerPerformanceAggregator: { compute: (...args: unknown[]) => computeMock(...args) },
}));

vi.mock('@/features/intelligence/services/CentralAISuiteService', () => ({
    aiSuite: {
        sellerCoaching: {
            generateCoachingReport: (...args: unknown[]) => generateCoachingReportMock(...args),
        },
    },
}));

vi.mock('@/lib/prisma', () => ({
    prisma: { user: { findUnique: (...args: unknown[]) => findUniqueMock(...args) } },
}));

import { gamificationRoutes } from '@/features/gamification/routes/gamification.routes';
import { errorHandler } from '@/shared/middlewares/errorHandler';

function buildApp(user = { id: 'user-1', organizationId: 'org-1', role: 'SDR' }) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        (req as unknown as { user: typeof user }).user = user;
        next();
    });
    app.use('/api/gamification', gamificationRoutes);
    app.use(errorHandler);
    return app;
}

const performanceFixture = {
    callsMade: 10,
    meetingsScheduled: 2,
    dealsClosed: 1,
    avgTicket: 5000,
    conversionRatePercent: 20,
};

const reportFixture = {
    motivationalHeadline: 'Boa semana!',
    overallGrade: 'B',
    celebrationPoint: 'x',
    criticalGaps: [],
    actionableMicroHabits: [],
    suggestedTrainingTopic: 'x',
    nextWeekTargetFocus: 'x',
};

beforeEach(() => {
    vi.clearAllMocks();
    findUniqueMock.mockResolvedValue({ name: 'Maria Silva' });
    computeMock.mockResolvedValue(performanceFixture);
    generateCoachingReportMock.mockResolvedValue(reportFixture);
    server.use(http.post(/^http:\/\/127\.0\.0\.1:\d+\/api\/gamification/, () => passthrough()));
});

describe('gamification routes', () => {
    it('POST /coaching/weekly usa nome e organização do usuário autenticado, nunca o que vem no body', async () => {
        const app = buildApp({ id: 'user-1', organizationId: 'org-42', role: 'SDR' });
        const res = await request(app)
            .post('/api/gamification/coaching/weekly')
            .send({ owner: 'outro-vendedor', organizationId: 'org-invasora' });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            success: true,
            data: { report: reportFixture, performance: performanceFixture, period: expect.any(String) },
        });
        expect(computeMock).toHaveBeenCalledWith('org-42', 'Maria Silva', expect.anything());
        expect(generateCoachingReportMock).toHaveBeenCalledWith(
            expect.objectContaining({ sellerName: 'Maria Silva' }),
        );
    });

    it('ignora um role inválido enviado no body em vez de repassá-lo à IA', async () => {
        const app = buildApp();
        await request(app)
            .post('/api/gamification/coaching/weekly')
            .send({ role: 'papel-inventado' });

        expect(generateCoachingReportMock).toHaveBeenCalledWith(
            expect.objectContaining({ role: undefined }),
        );
    });

    it('aceita um role válido enviado no body', async () => {
        const app = buildApp();
        await request(app)
            .post('/api/gamification/coaching/weekly')
            .send({ role: 'SDR / Hunter' });

        expect(generateCoachingReportMock).toHaveBeenCalledWith(
            expect.objectContaining({ role: 'SDR / Hunter' }),
        );
    });

    it('responde 404 quando o usuário autenticado não existe mais na base', async () => {
        findUniqueMock.mockResolvedValue(null);
        const app = buildApp();

        const res = await request(app).post('/api/gamification/coaching/weekly').send({});

        expect(res.status).toBe(404);
        expect(computeMock).not.toHaveBeenCalled();
    });

    it('propaga erro do agregador pro error handler global', async () => {
        computeMock.mockRejectedValue(new Error('Banco indisponível'));
        const app = buildApp();

        const res = await request(app).post('/api/gamification/coaching/weekly').send({});

        expect(res.status).toBe(500);
        expect(res.body.success).toBe(false);
    });
});
