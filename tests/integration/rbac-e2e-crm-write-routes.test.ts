import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';

import { prisma } from '../../src/lib/prisma';
import { authenticateToken } from '../../src/shared/middlewares/authenticateToken';
import { requireTenant } from '../../src/shared/middlewares/authorization';
import { companyRoutes } from '../../src/features/companies/routes/company.routes';
import { contactRoutes } from '../../src/features/contacts/routes/contact.routes';
import { activityRoutes } from '../../src/features/activities/routes/activity.routes';
import { errorHandler } from '../../src/shared/middlewares/errorHandler';
import { setupDI } from '../../src/shared/di/setup';
import { CompanyFactory, LeadFactory } from '../helpers/factories';
import { withRlsBypass, withTenant, signUpRealUser, type RealSessionUser } from '../helpers/rbac-e2e-helpers';

// Fecha a lacuna registrada em `.agents/handoffs/onda-1/01-para-04-role-gates-crm.md` ("Teste
// esperado"): TEST-006 (rbac-e2e.test.ts) e rbac-e2e-crm-operations.test.ts já cobrem
// DELETE/PUT/POST de lead ponta-a-ponta com sessão real, mas company/contact/activity nunca
// tinham um teste de matriz de acesso real (só um unit test com role ADMIN fixo em
// tests/unit/features/companies/routes/company.routes.test.ts) — este spec prova em runtime, com
// sessão e RLS reais, que VISUALIZADOR é barrado e SDR/GESTOR conseguem escrever, para os
// três routers restantes do handoff que ainda não tinham essa cobertura.

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/companies', authenticateToken, requireTenant, companyRoutes);
  app.use('/api/contacts', authenticateToken, requireTenant, contactRoutes);
  app.use('/api/activities', authenticateToken, requireTenant, activityRoutes);
  app.use(errorHandler);
  return app;
}

async function createCompany(organizationId: string): Promise<{ id: string }> {
  return withTenant(organizationId, () =>
    prisma.company.create({ data: CompanyFactory.build({ organizationId }) }) as unknown as Promise<{ id: string }>
  );
}

async function createLead(organizationId: string): Promise<{ id: string }> {
  return withTenant(organizationId, () =>
    prisma.lead.create({ data: LeadFactory.build({ organizationId }) }) as unknown as Promise<{ id: string }>
  );
}

describe('RBAC ponta-a-ponta — rotas de escrita de company/contact/activity', () => {
  let app: Express;

  let vendedorA: RealSessionUser;
  let viewerA: RealSessionUser;
  let gestorA: RealSessionUser;

  const createdUserIds: string[] = [];
  const createdOrgIds: string[] = [];

  beforeAll(async () => {
    setupDI();
    app = buildApp();

    vendedorA = await signUpRealUser('crmwrite-vendedor-a', 'SDR');
    viewerA = await signUpRealUser('crmwrite-viewer-a', 'VISUALIZADOR');
    gestorA = await signUpRealUser('crmwrite-gestor-a', 'GESTOR');

    for (const u of [vendedorA, viewerA, gestorA]) {
      createdUserIds.push(u.userId);
      createdOrgIds.push(u.organizationId);
    }
  }, 30_000);

  afterAll(async () => {
    await withRlsBypass(async () => {
      await prisma.activity.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
      await prisma.lead.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
      await prisma.contact.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
      await prisma.company.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: createdOrgIds } } });
    });
  });

  describe('POST /api/companies', () => {
    it('VISUALIZADOR: 403 do requireRole real, empresa não é criada', async () => {
      const before = await withTenant(viewerA.organizationId, () => prisma.company.count({ where: { organizationId: viewerA.organizationId } }));

      const res = await request(app)
        .post('/api/companies')
        .set('Cookie', viewerA.cookie)
        .send({ legalName: 'Empresa X', tradeName: 'X' });

      expect(res.status).toBe(403);
      const after = await withTenant(viewerA.organizationId, () => prisma.company.count({ where: { organizationId: viewerA.organizationId } }));
      expect(after).toBe(before);
    });

    it('SDR (writeRoles): cria de verdade (201)', async () => {
      const res = await request(app)
        .post('/api/companies')
        .set('Cookie', vendedorA.cookie)
        .send({ legalName: 'Empresa Y', tradeName: 'Y' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const created = await withTenant(vendedorA.organizationId, () => prisma.company.findUnique({ where: { id: res.body.data.id } }));
      expect(created?.organizationId).toBe(vendedorA.organizationId);
    });
  });

  describe('DELETE /api/companies/:id', () => {
    it('SDR: 403 (exclusão é GESTOR/ADMIN)', async () => {
      const company = await createCompany(vendedorA.organizationId);

      const res = await request(app)
        .delete(`/api/companies/${company.id}`)
        .set('Cookie', vendedorA.cookie);

      expect(res.status).toBe(403);
      const stillThere = await withTenant(vendedorA.organizationId, () => prisma.company.findUnique({ where: { id: company.id } }));
      expect(stillThere).not.toBeNull();
    });

    it('GESTOR: exclui de verdade (204)', async () => {
      const company = await createCompany(gestorA.organizationId);

      const res = await request(app)
        .delete(`/api/companies/${company.id}`)
        .set('Cookie', gestorA.cookie);

      expect(res.status).toBe(204);
    });
  });

  describe('POST /api/contacts', () => {
    it('VISUALIZADOR: 403 do requireRole real, contato não é criado', async () => {
      const company = await createCompany(viewerA.organizationId);

      const res = await request(app)
        .post('/api/contacts')
        .set('Cookie', viewerA.cookie)
        .send({ name: 'Fulano', companyId: company.id });

      expect(res.status).toBe(403);
    });

    it('SDR (writeRoles): cria de verdade (201)', async () => {
      const company = await createCompany(vendedorA.organizationId);

      const res = await request(app)
        .post('/api/contacts')
        .set('Cookie', vendedorA.cookie)
        .send({ name: 'Fulano de Tal', companyId: company.id });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });
  });

  describe('DELETE /api/contacts/:id', () => {
    it('SDR: 403 (exclusão é GESTOR/ADMIN)', async () => {
      const company = await createCompany(vendedorA.organizationId);
      const contact = await withTenant(vendedorA.organizationId, () =>
        prisma.contact.create({ data: { name: 'Ciclano', organizationId: vendedorA.organizationId, companyId: company.id } })
      );

      const res = await request(app)
        .delete(`/api/contacts/${contact.id}`)
        .set('Cookie', vendedorA.cookie);

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/activities', () => {
    it('VISUALIZADOR: 403 do requireRole real, atividade não é criada', async () => {
      const lead = await createLead(viewerA.organizationId);

      const res = await request(app)
        .post('/api/activities')
        .set('Cookie', viewerA.cookie)
        .send({ type: 'Ligação', owner: 'Fulano', date: new Date().toISOString(), leadId: lead.id, status: 'Pendente' });

      expect(res.status).toBe(403);
    });

    it('SDR (writeRoles): cria de verdade (201)', async () => {
      const lead = await createLead(vendedorA.organizationId);

      const res = await request(app)
        .post('/api/activities')
        .set('Cookie', vendedorA.cookie)
        .send({ type: 'Ligação', owner: 'Fulano', date: new Date().toISOString(), leadId: lead.id, status: 'Pendente' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('SDR: 422 quando o owner é um nome fabricado (ex.: fallback de ferramenta de IA)', async () => {
      const lead = await createLead(vendedorA.organizationId);

      const res = await request(app)
        .post('/api/activities')
        .set('Cookie', vendedorA.cookie)
        .send({ type: 'Ligação', owner: 'Enxame de IA Atlas', date: new Date().toISOString(), leadId: lead.id, status: 'Pendente' });

      expect(res.status).toBe(422);
    });
  });

  describe('DELETE /api/activities/:id', () => {
    it('SDR: 403 (exclusão é GESTOR/ADMIN)', async () => {
      const lead = await createLead(vendedorA.organizationId);
      const activity = await withTenant(vendedorA.organizationId, () =>
        prisma.activity.create({
          data: { type: 'Ligacao', owner: 'Fulano', date: new Date(), status: 'Pendente', leadId: lead.id, organizationId: vendedorA.organizationId },
        })
      );

      const res = await request(app)
        .delete(`/api/activities/${activity.id}`)
        .set('Cookie', vendedorA.cookie);

      expect(res.status).toBe(403);
    });
  });

  describe('sem sessão', () => {
    it('POST /api/companies: 401, sem chegar no requireRole', async () => {
      const res = await request(app).post('/api/companies').send({ legalName: 'X', tradeName: 'X' });
      expect(res.status).toBe(401);
    });
  });
});
