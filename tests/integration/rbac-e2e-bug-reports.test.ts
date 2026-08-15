import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';

import { prisma } from '../../src/lib/prisma';
import { authenticateToken } from '../../src/shared/middlewares/authenticateToken';
import { requireTenant } from '../../src/shared/middlewares/authorization';
import { bugReportRouter } from '../../src/features/bug-reports/bugReport.routes';
import { errorHandler } from '../../src/shared/middlewares/errorHandler';
import { withRlsBypass, withTenant, signUpRealUser, type RealSessionUser } from '../helpers/rbac-e2e-helpers';

// Ponta-a-ponta do módulo "Reportar Problema" (item 8 da governança de 12 requisitos), mesmo
// padrão de tests/integration/rbac-e2e-crm-operations.test.ts. Cobre: qualquer papel pode
// reportar, só ADMIN/GESTOR lista, isolamento de tenant na listagem, e que o texto sensível
// mandado pelo frontend é redigido antes de persistir (BugReport.context é JSONB legível
// diretamente por quem tiver acesso ao banco).
//
// Requer Postgres real via `.env.test` (ver tests/helpers/integration-setup.ts).

function buildApp(): Express {
    const app = express();
    app.use(express.json());
    app.use('/api/bug-reports', authenticateToken, requireTenant, bugReportRouter);
    app.use(errorHandler);
    return app;
}

describe('RBAC ponta-a-ponta — Bug Reports', () => {
    let app: Express;

    let adminA: RealSessionUser;
    let gestorA: RealSessionUser;
    let viewerA: RealSessionUser;
    let adminB: RealSessionUser;

    const createdUserIds: string[] = [];
    const createdOrgIds: string[] = [];

    beforeAll(async () => {
        app = buildApp();

        adminA = await signUpRealUser('bugs-admin-a', 'ADMIN');
        gestorA = await signUpRealUser('bugs-gestor-a', 'GESTOR');
        viewerA = await signUpRealUser('bugs-viewer-a', 'VISUALIZADOR');
        adminB = await signUpRealUser('bugs-admin-b', 'ADMIN');

        for (const u of [adminA, gestorA, viewerA, adminB]) {
            createdUserIds.push(u.userId);
            createdOrgIds.push(u.organizationId);
        }
    }, 30_000);

    afterAll(async () => {
        await withRlsBypass(async () => {
            await prisma.bugReport.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
            await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
            await prisma.organization.deleteMany({ where: { id: { in: createdOrgIds } } });
        });
    });

    describe('POST /api/bug-reports', () => {
        it('VISUALIZADOR consegue reportar um problema (201) — qualquer papel pode relatar', async () => {
            const res = await request(app)
                .post('/api/bug-reports')
                .set('Cookie', viewerA.cookie)
                .send({
                    title: 'Botão de salvar não responde',
                    description: 'Cliquei duas vezes e nada aconteceu.',
                    severity: 'HIGH',
                    context: { url: 'https://app.example/crm', userAgent: 'vitest' },
                });

            expect(res.status).toBe(201);
            expect(res.body.data.status).toBe('OPEN');
        });

        it('título/descrição ausentes: 400', async () => {
            const res = await request(app)
                .post('/api/bug-reports')
                .set('Cookie', viewerA.cookie)
                .send({ severity: 'LOW' });

            expect(res.status).toBe(400);
        });

        it('redige texto sensível do contexto antes de persistir', async () => {
            const res = await request(app)
                .post('/api/bug-reports')
                .set('Cookie', viewerA.cookie)
                .send({
                    title: 'Erro ao chamar integração',
                    description: 'A chamada falhou com Authorization: Bearer abc123.def456-ghi_789',
                    context: {
                        url: 'https://app.example/integrations',
                        recentLogs: [{ level: 'error', message: 'fetch falhou com Bearer abc123.def456-ghi_789', timestamp: new Date().toISOString() }],
                    },
                });

            expect(res.status).toBe(201);

            const stored = await withTenant(viewerA.organizationId, () =>
                prisma.bugReport.findUnique({ where: { id: res.body.data.id } })
            );

            expect(stored?.description).not.toContain('abc123.def456-ghi_789');
            const context = stored?.context as { recentLogs?: Array<{ message: string }> };
            expect(context?.recentLogs?.[0]?.message).not.toContain('abc123.def456-ghi_789');
        });
    });

    describe('GET /api/bug-reports', () => {
        it('VISUALIZADOR: 403 — quem relata não lista todos os relatos', async () => {
            const res = await request(app).get('/api/bug-reports').set('Cookie', viewerA.cookie);
            expect(res.status).toBe(403);
        });

        it('GESTOR: 200, lista só os relatos da própria organização', async () => {
            const res = await request(app).get('/api/bug-reports').set('Cookie', gestorA.cookie);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data)).toBe(true);
        });

        it('isolamento de tenant: ADMIN da Org B nunca vê relatos da Org A', async () => {
            await request(app)
                .post('/api/bug-reports')
                .set('Cookie', viewerA.cookie)
                .send({ title: 'Relato exclusivo da Org A', description: 'Não deve vazar para outra organização.' });

            const resB = await request(app).get('/api/bug-reports').set('Cookie', adminB.cookie);

            expect(resB.status).toBe(200);
            expect(resB.body.data.every((r: { organizationId: string }) => r.organizationId === adminB.organizationId)).toBe(true);
            expect(resB.body.data.some((r: { title: string }) => r.title === 'Relato exclusivo da Org A')).toBe(false);
        });
    });

    describe('PATCH /api/bug-reports/:id/status', () => {
        it('ADMIN triaga um relato da própria organização (200)', async () => {
            // Cada signUpRealUser cria uma organização própria (mesmo padrão de
            // rbac-e2e-commercial-intelligence.test.ts) — viewerA e adminA NÃO compartilham
            // tenant, então "própria organização" aqui precisa ser testado com o relato criado
            // pelo próprio adminA (POST não tem restrição de papel, ADMIN também pode relatar).
            const created = await request(app)
                .post('/api/bug-reports')
                .set('Cookie', adminA.cookie)
                .send({ title: 'Para triagem', description: 'Descrição qualquer.' });

            const res = await request(app)
                .patch(`/api/bug-reports/${created.body.data.id}/status`)
                .set('Cookie', adminA.cookie)
                .send({ status: 'TRIAGED' });

            expect(res.status).toBe(200);
            expect(res.body.data.status).toBe('TRIAGED');
        });

        it('ADMIN da Org B não consegue triagar relato da Org A (404, sem vazamento de existência)', async () => {
            const created = await request(app)
                .post('/api/bug-reports')
                .set('Cookie', viewerA.cookie)
                .send({ title: 'Só da Org A', description: 'Descrição qualquer.' });

            const res = await request(app)
                .patch(`/api/bug-reports/${created.body.data.id}/status`)
                .set('Cookie', adminB.cookie)
                .send({ status: 'RESOLVED' });

            expect(res.status).toBe(404);
        });

        it('status inválido: 400', async () => {
            const created = await request(app)
                .post('/api/bug-reports')
                .set('Cookie', viewerA.cookie)
                .send({ title: 'Status inválido', description: 'Descrição qualquer.' });

            const res = await request(app)
                .patch(`/api/bug-reports/${created.body.data.id}/status`)
                .set('Cookie', adminA.cookie)
                .send({ status: 'NAO_EXISTE' });

            expect(res.status).toBe(400);
        });
    });
});
