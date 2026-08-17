import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';

import { prisma } from '../../src/lib/prisma';
import { authenticateToken } from '../../src/shared/middlewares/authenticateToken';
import { requireTenant } from '../../src/shared/middlewares/authorization';
import { commercialIntelligenceRoutes } from '../../src/features/commercial-intelligence/routes/commercialIntelligence.routes';
import { errorHandler } from '../../src/shared/middlewares/errorHandler';
import { setupDI } from '../../src/shared/di/setup';
import { LeadFactory } from '../helpers/factories';
import { withRlsBypass, withTenant, signUpRealUser, type RealSessionUser } from '../helpers/rbac-e2e-helpers';

/**
 * RBAC ponta-a-ponta do módulo "Comercial Inteligente" — o requisito não-negociável do prompt de
 * produto (seção 2/31/41): só ADMIN/GESTOR acessam, com sessão real (não role simulado) e RLS
 * real do Postgres. Cobre os itens 1-10 da seção 41 (Gestor/Diretor→ADMIN/GESTOR autorizado,
 * SDR/vendedor/operador→CLOSER/SDR/VISUALIZADOR bloqueado, acesso direto por URL/API bloqueado,
 * tenant A não acessa tenant B).
 *
 * Mesma infraestrutura de `rbac-e2e-crm-operations.test.ts` (sessão real via Better Auth, RLS
 * real) — requer Postgres real via `.env.test` (ver tests/helpers/integration-setup.ts).
 */
function buildApp(): Express {
    const app = express();
    app.use(express.json());
    app.use('/api/commercial-intelligence', authenticateToken, requireTenant, commercialIntelligenceRoutes);
    app.use(errorHandler);
    return app;
}

const MONTH = '2026-08';

describe('RBAC ponta-a-ponta — Comercial Inteligente', () => {
    let app: Express;

    let adminA: RealSessionUser;
    let gestorA: RealSessionUser;
    let vendedorA: RealSessionUser;
    let viewerA: RealSessionUser;
    let gestorB: RealSessionUser;

    const createdUserIds: string[] = [];
    const createdOrgIds: string[] = [];

    beforeAll(async () => {
        setupDI();
        app = buildApp();

        adminA = await signUpRealUser('ci-admin-a', 'ADMIN');
        gestorA = await signUpRealUser('ci-gestor-a', 'GESTOR');
        vendedorA = await signUpRealUser('ci-vendedor-a', 'SDR');
        viewerA = await signUpRealUser('ci-viewer-a', 'VISUALIZADOR');
        gestorB = await signUpRealUser('ci-gestor-b', 'GESTOR');

        for (const u of [adminA, gestorA, vendedorA, viewerA, gestorB]) {
            createdUserIds.push(u.userId);
            createdOrgIds.push(u.organizationId);
        }

        // Um negócio real no funil Negócio da organização A, para os endpoints terem dado a
        // agregar (não é obrigatório para o teste de autorização, mas evita mascarar um 500 real
        // atrás de "base vazia" nos testes que checam 200).
        await withTenant(adminA.organizationId, () =>
            prisma.lead.create({
                data: LeadFactory.build({
                    funnel: 'Negocio',
                    amount: 50_000,
                    organizationId: adminA.organizationId,
                }),
            })
        );
    }, 30_000);

    afterAll(async () => {
        await withRlsBypass(async () => {
            await prisma.commercialGoal.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
            await prisma.leadStageHistory.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
            await prisma.lead.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
            await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
            await prisma.organization.deleteMany({ where: { id: { in: createdOrgIds } } });
        });
    });

    describe('Autorizados (ADMIN, GESTOR)', () => {
        it('ADMIN acessa GET /overview (200)', async () => {
            const res = await request(app).get(`/api/commercial-intelligence/overview?month=${MONTH}`).set('Cookie', adminA.cookie);
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it('GESTOR acessa GET /overview (200)', async () => {
            const res = await request(app).get(`/api/commercial-intelligence/overview?month=${MONTH}`).set('Cookie', gestorA.cookie);
            expect(res.status).toBe(200);
        });

        it('GESTOR consegue definir a meta (PUT /goals)', async () => {
            const res = await request(app)
                .put('/api/commercial-intelligence/goals')
                .set('Cookie', gestorA.cookie)
                .send({ period: MONTH, amount: 500_000 });
            expect(res.status).toBe(200);
            expect(res.body.data.amount).toBe(500_000);
        });
    });

    describe('Bloqueados (CLOSER, SDR, VISUALIZADOR — cobre vendedor/operador/financeiro/suporte/usuário comum)', () => {
        it('SDR recebe 403 em GET /overview', async () => {
            const res = await request(app).get(`/api/commercial-intelligence/overview?month=${MONTH}`).set('Cookie', vendedorA.cookie);
            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
        });

        it('VISUALIZADOR recebe 403 em GET /overview', async () => {
            const res = await request(app).get(`/api/commercial-intelligence/overview?month=${MONTH}`).set('Cookie', viewerA.cookie);
            expect(res.status).toBe(403);
        });

        it('SDR recebe 403 em cada endpoint do módulo (acesso direto por URL/API bloqueado)', async () => {
            const endpoints = [
                '/api/commercial-intelligence/overview',
                '/api/commercial-intelligence/pipeline-creation',
                '/api/commercial-intelligence/performance',
                '/api/commercial-intelligence/aging',
                '/api/commercial-intelligence/losses',
                '/api/commercial-intelligence/leading-indicators',
                '/api/commercial-intelligence/alerts',
                '/api/commercial-intelligence/crm-quality',
                '/api/commercial-intelligence/deals',
                '/api/commercial-intelligence/metrics-dictionary',
                '/api/commercial-intelligence/goals',
                '/api/commercial-intelligence/filter-options',
                '/api/commercial-intelligence/trends',
            ];
            for (const endpoint of endpoints) {
                const res = await request(app).get(`${endpoint}?month=${MONTH}`).set('Cookie', vendedorA.cookie);
                expect(res.status, `${endpoint} deveria bloquear SDR`).toBe(403);
            }
        });

        it('SDR recebe 403 ao tentar definir a meta (PUT /goals)', async () => {
            const res = await request(app)
                .put('/api/commercial-intelligence/goals')
                .set('Cookie', vendedorA.cookie)
                .send({ period: MONTH, amount: 999_999 });
            expect(res.status).toBe(403);
        });
    });

    describe('Sem sessão (acesso direto por URL sem login)', () => {
        it('recebe 401 sem cookie de sessão', async () => {
            const res = await request(app).get(`/api/commercial-intelligence/overview?month=${MONTH}`);
            expect(res.status).toBe(401);
        });
    });

    describe('Isolamento de tenant', () => {
        it('a meta definida pela organização B não é visível para a organização A', async () => {
            await request(app)
                .put('/api/commercial-intelligence/goals')
                .set('Cookie', gestorB.cookie)
                .send({ period: '2026-09', amount: 777_777 })
                .expect(200);

            const resA = await request(app).get('/api/commercial-intelligence/goals?month=2026-09').set('Cookie', gestorA.cookie);
            expect(resA.status).toBe(200);
            expect(resA.body.data).toBeNull();

            const resB = await request(app).get('/api/commercial-intelligence/goals?month=2026-09').set('Cookie', gestorB.cookie);
            expect(resB.body.data.amount).toBe(777_777);
        });
    });
});
