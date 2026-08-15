import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';

import { prisma } from '../../src/lib/prisma';
import { authenticateToken } from '../../src/shared/middlewares/authenticateToken';
import { requireTenant } from '../../src/shared/middlewares/authorization';
import { featureFlagsRouter } from '../../src/features/feature-flags/featureFlags.routes';
import { featureFlagsService } from '../../src/features/feature-flags/featureFlags.service';
import { errorHandler } from '../../src/shared/middlewares/errorHandler';
import { withRlsBypass, signUpRealUser, type RealSessionUser } from '../helpers/rbac-e2e-helpers';

// Ponta-a-ponta do módulo de Feature Flags (item 7 da governança de 12 requisitos), mesmo padrão
// de tests/integration/rbac-e2e-crm-operations.test.ts: sessão real via Better Auth + RLS real do
// Postgres, não mocks. Cobre o que a auditoria de arquitetura pediu explicitamente: só ADMIN
// altera, e a alteração nunca vaza para outra organização (isolamento de tenant).
//
// Requer Postgres real via `.env.test` (ver tests/helpers/integration-setup.ts).

function buildApp(): Express {
    const app = express();
    app.use(express.json());
    app.use('/api/feature-flags', authenticateToken, requireTenant, featureFlagsRouter);
    app.use(errorHandler);
    return app;
}

describe('RBAC ponta-a-ponta — Feature Flags', () => {
    let app: Express;

    let adminA: RealSessionUser;
    let vendedorA: RealSessionUser;
    let viewerA: RealSessionUser;
    let adminB: RealSessionUser;

    const createdUserIds: string[] = [];
    const createdOrgIds: string[] = [];

    beforeAll(async () => {
        app = buildApp();
        // Mesma sincronização que server.ts roda no boot — sem isto, a chave usada pelos testes
        // não existiria em FeatureFlag e todo PUT/GET voltaria vazio/404. Precisa do mesmo
        // bypassRls que server.ts usa no boot: sem tenant conhecido, a policy de RLS de
        // FeatureFlag bloqueia o upsert (ver BYPASS_RLS_ALLOWED_MODELS em src/lib/prisma.ts).
        await withRlsBypass(() => featureFlagsService.syncRegistry());

        adminA = await signUpRealUser('flags-admin-a', 'ADMIN');
        vendedorA = await signUpRealUser('flags-vendedor-a', 'VENDEDOR');
        viewerA = await signUpRealUser('flags-viewer-a', 'VISUALIZADOR');
        adminB = await signUpRealUser('flags-admin-b', 'ADMIN');

        for (const u of [adminA, vendedorA, viewerA, adminB]) {
            createdUserIds.push(u.userId);
            createdOrgIds.push(u.organizationId);
        }
    }, 30_000);

    afterAll(async () => {
        await withRlsBypass(async () => {
            await prisma.organizationFeatureFlag.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
            await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
            await prisma.organization.deleteMany({ where: { id: { in: createdOrgIds } } });
        });
    });

    describe('GET /api/feature-flags', () => {
        it('qualquer papel autenticado pode ler a lista resolvida (200), inclusive VISUALIZADOR', async () => {
            const res = await request(app).get('/api/feature-flags').set('Cookie', viewerA.cookie);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.some((f: { key: string }) => f.key === 'bug_report_module')).toBe(true);
        });
    });

    describe('PUT /api/feature-flags/:key', () => {
        it('VISUALIZADOR: 403, sem alterar nada', async () => {
            const res = await request(app)
                .put('/api/feature-flags/bug_report_module')
                .set('Cookie', viewerA.cookie)
                .send({ enabled: false });

            expect(res.status).toBe(403);
        });

        it('VENDEDOR: 403', async () => {
            const res = await request(app)
                .put('/api/feature-flags/bug_report_module')
                .set('Cookie', vendedorA.cookie)
                .send({ enabled: false });

            expect(res.status).toBe(403);
        });

        it('ADMIN: 200, cria/atualiza o override só da própria organização', async () => {
            const res = await request(app)
                .put('/api/feature-flags/bug_report_module')
                .set('Cookie', adminA.cookie)
                .send({ enabled: false });

            expect(res.status).toBe(200);
            expect(res.body.data).toMatchObject({ key: 'bug_report_module', enabled: false, isOverridden: true });
        });

        it('chave desconhecida: 404, nenhuma linha criada', async () => {
            const res = await request(app)
                .put('/api/feature-flags/flag_totalmente_inventada_xyz')
                .set('Cookie', adminA.cookie)
                .send({ enabled: true });

            expect(res.status).toBe(404);
        });

        it('"enabled" não-booleano: 400', async () => {
            const res = await request(app)
                .put('/api/feature-flags/bug_report_module')
                .set('Cookie', adminA.cookie)
                .send({ enabled: 'sim' });

            expect(res.status).toBe(400);
        });

        it('isolamento de tenant: override do ADMIN da Org A não aparece resolvido para a Org B', async () => {
            await request(app)
                .put('/api/feature-flags/bug_report_module')
                .set('Cookie', adminA.cookie)
                .send({ enabled: false });

            const resB = await request(app).get('/api/feature-flags').set('Cookie', adminB.cookie);
            const flagB = resB.body.data.find((f: { key: string }) => f.key === 'bug_report_module');

            // Org B nunca setou override — deve continuar no default global (true, ver
            // FEATURE_FLAG_REGISTRY), não herdar o `false` que a Org A acabou de setar.
            expect(flagB.enabled).toBe(true);
            expect(flagB.isOverridden).toBe(false);
        });
    });

    describe('DELETE /api/feature-flags/:key', () => {
        it('ADMIN: remove o override e reverte ao default global', async () => {
            await request(app)
                .put('/api/feature-flags/bug_report_module')
                .set('Cookie', adminA.cookie)
                .send({ enabled: false });

            const del = await request(app)
                .delete('/api/feature-flags/bug_report_module')
                .set('Cookie', adminA.cookie);

            expect(del.status).toBe(200);
            expect(del.body.data).toMatchObject({ enabled: true, isOverridden: false });
        });

        it('VISUALIZADOR: 403', async () => {
            const res = await request(app)
                .delete('/api/feature-flags/bug_report_module')
                .set('Cookie', viewerA.cookie);

            expect(res.status).toBe(403);
        });
    });
});
