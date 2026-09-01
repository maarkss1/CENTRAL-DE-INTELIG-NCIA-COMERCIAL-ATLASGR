import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';

import { prisma } from '../../src/lib/prisma';
import { authenticateToken } from '../../src/shared/middlewares/authenticateToken';
import { requireTenant } from '../../src/shared/middlewares/authorization';
import { requireRole } from '../../src/shared/middlewares/requireRole';
import { usageRoutes } from '../../src/features/billing/routes/usage.routes';
import { errorHandler } from '../../src/shared/middlewares/errorHandler';
import { setupDI } from '../../src/shared/di/setup';
import { withRlsBypass, withTenant, signUpRealUser, type RealSessionUser } from '../helpers/rbac-e2e-helpers';

/**
 * RBAC ponta-a-ponta de GET /api/usage — lacuna documentada no Piloto 022 (`.claude/PILOTS.md`):
 * `tests/unit/features/billing/routes/usage.routes.test.ts` monta seu próprio Express de teste sem
 * o `requireRole` real (injeta `role: 'ADMIN'` direto no request simulado), então a proteção
 * "só ADMIN/GESTOR acessa `/api/usage`" declarada em `src/bootstrap/routes.ts` nunca era de fato
 * exercitada por nenhum teste automatizado — se o `requireRole(['ADMIN', 'GESTOR'])` fosse removido
 * ou quebrado ali, nenhum teste pegaria.
 *
 * Este spec monta o app com a MESMA cadeia de middleware real usada em produção
 * (authenticateToken, requireTenant, requireRole(['ADMIN', 'GESTOR'])) — sem injeção manual de
 * papel — e usa sessão real via Better Auth + RLS real do Postgres, mesmo padrão de
 * `rbac-e2e-commercial-intelligence.test.ts` (outro módulo com o mesmo par de papéis autorizados).
 *
 * Requer Postgres real via `.env.test` (ver tests/helpers/integration-setup.ts).
 */
function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(
    '/api/usage',
    authenticateToken,
    requireTenant,
    requireRole(['ADMIN', 'GESTOR']),
    usageRoutes,
  );
  app.use(errorHandler);
  return app;
}

describe('RBAC ponta-a-ponta — Consumo de IA (/api/usage)', () => {
  let app: Express;

  let adminA: RealSessionUser;
  let gestorA: RealSessionUser;
  let closerA: RealSessionUser;
  let sdrA: RealSessionUser;
  let viewerA: RealSessionUser;
  let adminB: RealSessionUser;

  const createdUserIds: string[] = [];
  const createdOrgIds: string[] = [];

  beforeAll(async () => {
    setupDI();
    app = buildApp();

    adminA = await signUpRealUser('usage-admin-a', 'ADMIN');
    gestorA = await signUpRealUser('usage-gestor-a', 'GESTOR');
    closerA = await signUpRealUser('usage-closer-a', 'CLOSER');
    sdrA = await signUpRealUser('usage-sdr-a', 'SDR');
    viewerA = await signUpRealUser('usage-viewer-a', 'VISUALIZADOR');
    adminB = await signUpRealUser('usage-admin-b', 'ADMIN');

    for (const u of [adminA, gestorA, closerA, sdrA, viewerA, adminB]) {
      createdUserIds.push(u.userId);
      createdOrgIds.push(u.organizationId);
    }

    // Uma chamada de IA real registrada para a organização A — sem isto, um GET 200 com base
    // totalmente vazia mascararia um 500 real atrás de "isEmpty: true" (mesmo raciocínio do
    // comentário equivalente em rbac-e2e-commercial-intelligence.test.ts).
    await withTenant(adminA.organizationId, () =>
      prisma.aILog.create({
        data: {
          tokens: 1234,
          cost: 0.42,
          latencyMs: 250,
          model: 'test-model',
          organizationId: adminA.organizationId,
        },
      }),
    );
  }, 30_000);

  afterAll(async () => {
    await withRlsBypass(async () => {
      await prisma.aILog.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: createdOrgIds } } });
    });
  });

  describe('Autorizados (ADMIN, GESTOR)', () => {
    it('ADMIN acessa GET /api/usage (200) e recebe o resumo real da própria organização', async () => {
      const res = await request(app).get('/api/usage').set('Cookie', adminA.cookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isEmpty).toBe(false);
      expect(res.body.data.totalTokens).toBe(1234);
    });

    it('GESTOR acessa GET /api/usage (200)', async () => {
      const res = await request(app).get('/api/usage').set('Cookie', gestorA.cookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Bloqueados (CLOSER, SDR, VISUALIZADOR)', () => {
    it('CLOSER recebe 403 em GET /api/usage', async () => {
      const res = await request(app).get('/api/usage').set('Cookie', closerA.cookie);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('SDR recebe 403 em GET /api/usage', async () => {
      const res = await request(app).get('/api/usage').set('Cookie', sdrA.cookie);

      expect(res.status).toBe(403);
    });

    it('VISUALIZADOR recebe 403 em GET /api/usage', async () => {
      const res = await request(app).get('/api/usage').set('Cookie', viewerA.cookie);

      expect(res.status).toBe(403);
    });
  });

  describe('Sem sessão (acesso direto por URL sem login)', () => {
    it('recebe 401 sem cookie de sessão', async () => {
      const res = await request(app).get('/api/usage');

      expect(res.status).toBe(401);
    });
  });

  describe('Isolamento de tenant', () => {
    it('o consumo da organização A não vaza para o resumo da organização B', async () => {
      const resB = await request(app).get('/api/usage').set('Cookie', adminB.cookie);

      expect(resB.status).toBe(200);
      expect(resB.body.data.isEmpty).toBe(true);
      expect(resB.body.data.totalTokens).toBe(0);
    });
  });
});
