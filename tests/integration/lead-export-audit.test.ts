import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';

import { prisma } from '../../src/lib/prisma';
import { authenticateToken } from '../../src/shared/middlewares/authenticateToken';
import { requireTenant } from '../../src/shared/middlewares/authorization';
import { leadRoutes } from '../../src/features/crm/routes/lead.routes';
import { errorHandler } from '../../src/shared/middlewares/errorHandler';
import { setupDI } from '../../src/shared/di/setup';
import { LeadFactory } from '../helpers/factories';
import { withRlsBypass, withTenant, signUpRealUser, type RealSessionUser } from '../helpers/rbac-e2e-helpers';

// Resolve o handoff roadmap-v2-transversais/15-para-00-auditaccessmiddleware-nao-utilizado.md:
// auditAccessMiddleware existia (com teste unitário próprio da própria lógica de gravação), mas
// não estava montado em nenhuma rota — GET /api/leads/export/csv (dump completo de nome/telefone/
// e-mail de todos os leads do tenant) não tinha nenhuma trilha de auditoria. Este spec prova, com
// sessão e RLS reais, que a rota agora grava um AuditLog de EXPORT — não repete a cobertura de
// tests/unit/lib/security/auditLog.middleware.test.ts (que já cobre a lógica interna da função).
//
// Requer Postgres real via `.env.test` (ver tests/helpers/integration-setup.ts).

function buildLeadApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/leads', authenticateToken, requireTenant, leadRoutes);
  app.use(errorHandler);
  return app;
}

describe('GET /api/leads/export/csv — trilha de auditoria (Etapa handoff 15)', () => {
  let app: Express;
  let adminA: RealSessionUser;
  let vendedorA: RealSessionUser;

  const createdUserIds: string[] = [];
  const createdOrgIds: string[] = [];

  beforeAll(async () => {
    setupDI();
    app = buildLeadApp();

    adminA = await signUpRealUser('leadexport-admin-a', 'ADMIN');
    vendedorA = await signUpRealUser('leadexport-sdr-a', 'SDR');

    for (const u of [adminA, vendedorA]) {
      createdUserIds.push(u.userId);
      createdOrgIds.push(u.organizationId);
    }

    await withTenant(adminA.organizationId, () => prisma.lead.create({ data: LeadFactory.build() }));
  }, 30_000);

  afterAll(async () => {
    await withRlsBypass(async () => {
      await prisma.auditLog.deleteMany({ where: { tenantId: { in: createdOrgIds } } });
      await prisma.lead.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: createdOrgIds } } });
    });
  });

  it('ADMIN: 200 e grava AuditLog com action EXPORT, entity Lead e tenant/ator corretos', async () => {
    const res = await request(app)
      .get('/api/leads/export/csv')
      .set('Cookie', adminA.cookie);

    expect(res.status).toBe(200);

    const logs = await withRlsBypass(() =>
      prisma.auditLog.findMany({ where: { tenantId: adminA.organizationId, entity: 'Lead', action: 'EXPORT' } })
    );
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].actorId).toBe(adminA.userId);
    expect(logs[0].tenantId).toBe(adminA.organizationId);
  });

  it('SDR (fora de managementRoles): 403 do requireRole real, sem AuditLog gravado', async () => {
    const before = await withRlsBypass(() =>
      prisma.auditLog.count({ where: { tenantId: vendedorA.organizationId, entity: 'Lead', action: 'EXPORT' } })
    );

    const res = await request(app)
      .get('/api/leads/export/csv')
      .set('Cookie', vendedorA.cookie);

    expect(res.status).toBe(403);

    const after = await withRlsBypass(() =>
      prisma.auditLog.count({ where: { tenantId: vendedorA.organizationId, entity: 'Lead', action: 'EXPORT' } })
    );
    // auditAccessMiddleware só está depois de managementRoles na cadeia — um 403 do requireRole
    // nem chega a rodar o middleware de auditoria (res.on('finish') só grava se statusCode < 400
    // de qualquer forma, mas o próprio next() do middleware de auditoria nunca é alcançado aqui).
    expect(after).toBe(before);
  });
});
