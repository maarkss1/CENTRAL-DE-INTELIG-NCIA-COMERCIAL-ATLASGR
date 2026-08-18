import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';

import { prisma } from '../../src/lib/prisma';
import { env } from '../../src/config/env';
import { authenticateToken } from '../../src/shared/middlewares/authenticateToken';
import { requireTenant } from '../../src/shared/middlewares/authorization';
import { requireRole } from '../../src/shared/middlewares/requireRole';
import { requirePlatformOperator } from '../../src/shared/middlewares/requirePlatformOperator';
import { errorHandler } from '../../src/shared/middlewares/errorHandler';
import { signUpRealUser, withRlsBypass, type RealSessionUser } from '../helpers/rbac-e2e-helpers';

// SEC-001 (Sprint 01/Onda 13): RBAC ponta-a-ponta da rota /admin/queues (Bull Board), mesma
// técnica de tests/integration/rbac-e2e.test.ts (sessão real do better-auth, não um `req.user`
// fabricado) — monta a MESMA cadeia de middlewares que server.ts usa em /admin/queues
// (authenticateToken, requireTenant, requireRole(['ADMIN']), requirePlatformOperator), com um
// handler leve no lugar do router real do Bull Board (que exige Redis/BullMQ real pra montar).
//
// requirePlatformOperator lê `env.PLATFORM_OPERATOR_TOKEN` — não mockamos o módulo `env` inteiro
// aqui (ele é importado por dezenas de módulos, incluindo o Better Auth real que este teste
// precisa de verdade); em vez disso, o valor vem de `.env.test` (mesma fonte que todo o resto da
// suíte de integração usa), e o teste falha alto e explícito se ele não estiver setado — não
// silenciosamente "pula" a cobertura.
if (!env.PLATFORM_OPERATOR_TOKEN) {
  throw new Error(
    'PLATFORM_OPERATOR_TOKEN ausente em .env.test — necessário para tests/integration/sec001-bullboard-access.test.ts (SEC-001).'
  );
}
const OPERATOR_TOKEN = env.PLATFORM_OPERATOR_TOKEN;

function buildAdminQueuesApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(
    '/admin/queues',
    authenticateToken,
    requireTenant,
    requireRole(['ADMIN']),
    requirePlatformOperator,
    (_req, res) => res.status(200).json({ success: true, mounted: 'bullboard-stub' })
  );
  app.use(errorHandler);
  return app;
}

describe('SEC-001 — RBAC + operador de plataforma em /admin/queues (Bull Board)', () => {
  let app: Express;
  let adminA: RealSessionUser;
  let viewerA: RealSessionUser;
  let adminB: RealSessionUser;

  const createdUserIds: string[] = [];
  const createdOrgIds: string[] = [];

  beforeAll(async () => {
    app = buildAdminQueuesApp();
    adminA = await signUpRealUser('admin-a-bullboard', 'ADMIN');
    viewerA = await signUpRealUser('viewer-a-bullboard', 'VISUALIZADOR');
    adminB = await signUpRealUser('admin-b-bullboard', 'ADMIN');

    for (const u of [adminA, viewerA, adminB]) {
      createdUserIds.push(u.userId);
      createdOrgIds.push(u.organizationId);
    }
  }, 30_000);

  afterAll(async () => {
    await withRlsBypass(async () => {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: createdOrgIds } } });
    });
  });

  it('sem sessão: 401, nunca chega em requireRole', async () => {
    const res = await request(app).get('/admin/queues/');
    expect(res.status).toBe(401);
  });

  it('sessão real, papel comum (VISUALIZADOR): 403 pelo requireRole real, antes de qualquer checagem de token', async () => {
    const res = await request(app).get('/admin/queues/').set('Cookie', viewerA.cookie);
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('ADMIN');
  });

  it('ADMIN de tenant, sem apresentar o token de operador de plataforma: 403 — ADMIN de tenant sozinho não basta (SEC-001)', async () => {
    const res = await request(app).get('/admin/queues/').set('Cookie', adminA.cookie);
    expect(res.status).toBe(403);
  });

  it('ADMIN de tenant com token de operador ERRADO: 403', async () => {
    const res = await request(app)
      .get('/admin/queues/')
      .set('Cookie', adminA.cookie)
      .set('x-platform-operator-token', 'token-errado');
    expect(res.status).toBe(403);
  });

  it('ADMIN de tenant com token de operador CORRETO: passa (200)', async () => {
    const res = await request(app)
      .get('/admin/queues/')
      .set('Cookie', adminA.cookie)
      .set('x-platform-operator-token', OPERATOR_TOKEN);
    expect(res.status).toBe(200);
  });

  it('ADMIN de OUTRO tenant (org B) com token de operador correto também passa — Bull Board não filtra por tenant (risco residual já documentado em docs/security/SECURITY_GUIDE.md, não uma regressão)', async () => {
    const res = await request(app)
      .get('/admin/queues/')
      .set('Cookie', adminB.cookie)
      .set('x-platform-operator-token', OPERATOR_TOKEN);
    expect(res.status).toBe(200);
  });
});
