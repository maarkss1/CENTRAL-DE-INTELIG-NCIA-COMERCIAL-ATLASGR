import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';

import { prisma } from '../../src/lib/prisma';
import { authenticateToken } from '../../src/shared/middlewares/authenticateToken';
import { requireTenant } from '../../src/shared/middlewares/authorization';
import { leadRoutes } from '../../src/features/crm/routes/lead.routes';
import { crm360Routes } from '../../src/features/crm360/routes/crm360.routes';
import { bitrixRoutes } from '../../src/features/integrations/bitrix/bitrix.routes';
import { errorHandler } from '../../src/shared/middlewares/errorHandler';
import { setupDI } from '../../src/shared/di/setup';
import { LeadFactory } from '../helpers/factories';
import { withRlsBypass, withTenant, signUpRealUser, type RealSessionUser } from '../helpers/rbac-e2e-helpers';

// Estende a cobertura de TEST-006 (rbac-e2e.test.ts, só DELETE /api/leads/:id) às demais
// operações sensíveis do CRM listadas na Etapa 02 (auditoria RBAC) que ainda não tinham teste
// E2E real: mover lead entre estágios (PUT /api/crm/records/:id/stage), converter lead em
// negócio (POST /api/crm/leads/:id/convert), reenriquecer lead (POST /api/leads/:id/enrich) e
// importar do Bitrix24 (POST /api/bitrix/leads/import). A auditoria (leitura de código) já
// confirmou que os quatro filtram organizationId explicitamente e exigem role — este spec prova
// isso em runtime, com sessão e RLS reais, como TEST-006 já fazia para o delete.
//
// Requer Postgres real via `.env.test` (ver tests/helpers/integration-setup.ts).

function buildCrmApp(): Express {
  const app = express();
  app.use(express.json());
  // Mesma cadeia de middlewares reais que server.ts monta em `/api/leads` e `/api/crm`.
  app.use('/api/leads', authenticateToken, requireTenant, leadRoutes);
  app.use('/api/crm', authenticateToken, requireTenant, crm360Routes);
  app.use('/api/bitrix', authenticateToken, requireTenant, bitrixRoutes);
  app.use(errorHandler);
  return app;
}

async function createLead(organizationId: string): Promise<{ id: string }> {
  return withTenant(organizationId, () =>
    prisma.lead.create({ data: LeadFactory.build() }) as unknown as Promise<{ id: string }>
  );
}

/** Garante o pipeline padrão do funil Negócio e devolve o id da sua primeira etapa (usado pelo
 * teste de PUT /records/:id/stage — precisa de um stageId real pertencente ao tenant).
 * Usa o repositório real (mesmo que crm360Routes resolve via DI) — não a implementação alternativa
 * de src/features/crm360/services/crm360.service.ts, que nenhuma rota da aplicação usa (removida
 * na Sprint 05/Onda 17, DATA-004, por ser um segundo conjunto de LEAD_STAGES/DEAL_STAGES mantido
 * manualmente em paralelo ao real, sem nenhum import fora de si mesma). */
async function firstDealStageId(organizationId: string): Promise<string> {
  return withTenant(organizationId, async () => {
    const { PrismaCrm360Repository } = await import('../../src/features/crm360/infra/PrismaCrm360Repository');
    const pipelines = await new PrismaCrm360Repository().getPipelines(organizationId);
    const dealPipeline = pipelines.find((p) => p.entity === 'Negocio');
    const stage = dealPipeline?.stages[0];
    if (!stage) throw new Error('Pipeline de Negócio sem etapa inicial — setup do teste está errado.');
    return stage.id;
  });
}

describe('RBAC ponta-a-ponta — operações do CRM (Etapa 02)', () => {
  let app: Express;

  let adminA: RealSessionUser;
  let vendedorA: RealSessionUser;
  let viewerA: RealSessionUser;
  let adminB: RealSessionUser;

  const createdUserIds: string[] = [];
  const createdOrgIds: string[] = [];

  beforeAll(async () => {
    setupDI();
    app = buildCrmApp();

    adminA = await signUpRealUser('crmops-admin-a', 'ADMIN');
    vendedorA = await signUpRealUser('crmops-vendedor-a', 'SDR');
    viewerA = await signUpRealUser('crmops-viewer-a', 'VISUALIZADOR');
    adminB = await signUpRealUser('crmops-admin-b', 'ADMIN');

    for (const u of [adminA, vendedorA, viewerA, adminB]) {
      createdUserIds.push(u.userId);
      createdOrgIds.push(u.organizationId);
    }
  }, 30_000);

  afterAll(async () => {
    await withRlsBypass(async () => {
      await prisma.lead.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
      await prisma.crmPipelineStage.deleteMany({ where: { pipeline: { organizationId: { in: createdOrgIds } } } });
      await prisma.crmPipeline.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: createdOrgIds } } });
    });
  });

  describe('PUT /api/crm/records/:id/stage (mover lead entre estágios)', () => {
    it('SDR (writeRoles) no próprio tenant: move de verdade (200)', async () => {
      const lead = await createLead(vendedorA.organizationId);
      const stageId = await firstDealStageId(vendedorA.organizationId);

      const res = await request(app)
        .put(`/api/crm/records/${lead.id}/stage`)
        .set('Cookie', vendedorA.cookie)
        .send({ stageId });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.pipelineStageId).toBe(stageId);
    });

    it('VISUALIZADOR: 403 do requireRole real, sem efeito no banco', async () => {
      const lead = await createLead(viewerA.organizationId);
      // firstDealStageId chama ensureDefaultPipelines, que por sua vez anexa leads legados ao
      // pipeline padrão (attachLegacyRecords) como efeito colateral — precisa rodar ANTES de
      // capturar o estado "antes", senão o teste compara contra um estado que ainda ia mudar por
      // um motivo não relacionado ao RBAC sendo testado aqui.
      const stageId = await firstDealStageId(viewerA.organizationId);
      const before = await withTenant(viewerA.organizationId, () => prisma.lead.findUnique({ where: { id: lead.id } }));

      const res = await request(app)
        .put(`/api/crm/records/${lead.id}/stage`)
        .set('Cookie', viewerA.cookie)
        .send({ stageId });

      expect(res.status).toBe(403);

      const untouched = await withTenant(viewerA.organizationId, () => prisma.lead.findUnique({ where: { id: lead.id } }));
      expect(untouched?.pipelineStageId).toBe(before?.pipelineStageId);
      expect(untouched?.pipelineStageId).not.toBe(stageId);
    });

    it('isolamento de tenant: ADMIN da Org B não move lead da Org A usando um stageId da própria Org B', async () => {
      const leadFromOrgA = await createLead(adminA.organizationId);
      const stageIdFromOrgB = await firstDealStageId(adminB.organizationId);

      const res = await request(app)
        .put(`/api/crm/records/${leadFromOrgA.id}/stage`)
        .set('Cookie', adminB.cookie)
        .send({ stageId: stageIdFromOrgB });

      // PrismaCrm360Repository.updateLeadStage faz findFirstOrThrow com where:{id, organizationId}
      // — um leadId de outra org simplesmente não é encontrado (P2025), o que o errorHandler não
      // mapeia como 2xx.
      expect(res.status).not.toBe(200);

      const untouched = await withTenant(adminA.organizationId, () => prisma.lead.findUnique({ where: { id: leadFromOrgA.id } }));
      expect(untouched?.pipelineStageId).toBeNull();
      expect(untouched?.organizationId).toBe(adminA.organizationId);
    });

    it('isolamento de tenant: ADMIN da Org B não consegue nem referenciar um stageId da Org A (etapa não encontrada)', async () => {
      const leadFromOrgB = await createLead(adminB.organizationId);
      const stageIdFromOrgA = await firstDealStageId(adminA.organizationId);

      const res = await request(app)
        .put(`/api/crm/records/${leadFromOrgB.id}/stage`)
        .set('Cookie', adminB.cookie)
        .send({ stageId: stageIdFromOrgA });

      // PrismaCrm360Repository.updateLeadStage busca a etapa com
      // where:{id, pipeline:{organizationId}} — um stageId de outra org não é "encontrado" (mesmo
      // existindo na tabela).
      expect(res.status).not.toBe(200);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/crm/leads/:id/convert (converter lead em negócio)', () => {
    it('GESTOR (writeRoles) no próprio tenant: converte de verdade (200)', async () => {
      const gestor = await signUpRealUser('crmops-gestor-a', 'GESTOR');
      createdUserIds.push(gestor.userId);
      createdOrgIds.push(gestor.organizationId);
      const lead = await createLead(gestor.organizationId);

      const res = await request(app)
        .post(`/api/crm/leads/${lead.id}/convert`)
        .set('Cookie', gestor.cookie);

      expect(res.status).toBe(200);
      expect(res.body.data.funnel).toBe('Negocio');
    });

    it('VISUALIZADOR: 403, lead permanece no funil Lead', async () => {
      const lead = await createLead(viewerA.organizationId);

      const res = await request(app)
        .post(`/api/crm/leads/${lead.id}/convert`)
        .set('Cookie', viewerA.cookie);

      expect(res.status).toBe(403);

      const untouched = await withTenant(viewerA.organizationId, () => prisma.lead.findUnique({ where: { id: lead.id } }));
      expect(untouched?.funnel).toBe('Lead');
    });

    it('isolamento de tenant: ADMIN da Org B não converte lead da Org A', async () => {
      const leadFromOrgA = await createLead(adminA.organizationId);

      const res = await request(app)
        .post(`/api/crm/leads/${leadFromOrgA.id}/convert`)
        .set('Cookie', adminB.cookie);

      expect(res.status).not.toBe(200);

      const untouched = await withTenant(adminA.organizationId, () => prisma.lead.findUnique({ where: { id: leadFromOrgA.id } }));
      expect(untouched?.funnel).toBe('Lead');
    });
  });

  describe('POST /api/leads/:id/enrich (reenriquecer lead)', () => {
    it('VISUALIZADOR: 403 do requireRole real, antes de qualquer chamada externa de enriquecimento', async () => {
      const lead = await createLead(viewerA.organizationId);

      const res = await request(app)
        .post(`/api/leads/${lead.id}/enrich`)
        .set('Cookie', viewerA.cookie);

      expect(res.status).toBe(403);
    });

    it('isolamento de tenant: SDR da Org B não consegue nem iniciar enriquecimento de lead da Org A', async () => {
      const leadFromOrgA = await createLead(adminA.organizationId);
      const vendedorB = await signUpRealUser('crmops-vendedor-b', 'SDR');
      createdUserIds.push(vendedorB.userId);
      createdOrgIds.push(vendedorB.organizationId);

      const res = await request(app)
        .post(`/api/leads/${leadFromOrgA.id}/enrich`)
        .set('Cookie', vendedorB.cookie);

      // LeadUseCases.enrichLead faz repository.findById(organizationId, id) antes de qualquer
      // chamada externa — um lead de outra org nunca é encontrado, então nunca chega a chamar
      // Apollo/Receita Federal (o que tornaria este teste dependente de rede externa).
      expect(res.status).not.toBe(200);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/bitrix/leads/import (importar do Bitrix24)', () => {
    it('VISUALIZADOR: 403 do requireRole real (managementRoles), sem sequer validar o corpo da requisição', async () => {
      const res = await request(app)
        .post('/api/bitrix/leads/import')
        .set('Cookie', viewerA.cookie)
        .send({ connectionId: 'nao-importa-o-valor', bitrixLeadIds: ['1'] });

      expect(res.status).toBe(403);
    });

    it('SDR: 404 (import agora permite SDR, então passa do 403 e dá 404 por conexão não encontrada)', async () => {
      const res = await request(app)
        .post('/api/bitrix/leads/import')
        .set('Cookie', vendedorA.cookie)
        .send({ connectionId: 'nao-importa-o-valor', bitrixLeadIds: ['1'] });

      expect(res.status).toBe(404);
    });

    it('sem sessão: 401, sem chegar no requireRole', async () => {
      const res = await request(app)
        .post('/api/bitrix/leads/import')
        .send({ connectionId: 'nao-importa-o-valor', bitrixLeadIds: ['1'] });

      expect(res.status).toBe(401);
    });
  });
});
