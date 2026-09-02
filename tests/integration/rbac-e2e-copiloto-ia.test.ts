import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';

import { prisma } from '../../src/lib/prisma';
import { authenticateToken } from '../../src/shared/middlewares/authenticateToken';
import { requireTenant } from '../../src/shared/middlewares/authorization';
import { copilotoIaRoutes } from '../../src/features/copiloto-ia/routes/copilotoIa.routes';
import { errorHandler } from '../../src/shared/middlewares/errorHandler';
import { setupDI } from '../../src/shared/di/setup';
import { LeadFactory } from '../helpers/factories';
import {
  withRlsBypass,
  withTenant,
  signUpRealUser,
  type RealSessionUser,
} from '../helpers/rbac-e2e-helpers';

/**
 * RBAC ponta-a-ponta do "Copiloto Comercial IA" (fundação — Onda 1): ADMIN/GESTOR/CLOSER/SDR
 * autorizados, VISUALIZADOR bloqueado, sessão real (não role simulado), RLS real do Postgres,
 * isolamento cross-tenant. Mesmo desenho de `rbac-e2e-commercial-intelligence.test.ts`.
 */
function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/copiloto-ia', authenticateToken, requireTenant, copilotoIaRoutes);
  app.use(errorHandler);
  return app;
}

describe('RBAC ponta-a-ponta — Copiloto Comercial IA', () => {
  let app: Express;

  let adminA: RealSessionUser;
  let gestorA: RealSessionUser;
  let closerA: RealSessionUser;
  let sdrA: RealSessionUser;
  let viewerA: RealSessionUser;
  let gestorB: RealSessionUser;

  // `signUpRealUser` cria uma organização NOVA a cada chamada (mesmo padrão de
  // rbac-e2e-commercial-intelligence.test.ts/rbac-e2e-crm-operations.test.ts) — adminA/gestorA/
  // closerA/sdrA/viewerA são 5 tenants DISTINTOS, não "papéis dentro da mesma organização A". Por
  // isso cada um que precisa vincular uma conversa a um Lead tem o SEU PRÓPRIO Lead, criado no
  // tenant certo — usar um único `leadA` para todos os papéis dispararia (corretamente) a checagem
  // de `leadExists` cross-tenant que este módulo tem de propósito.
  let leadOfAdminA: string;
  let leadOfGestorA: string;
  let leadOfCloserA: string;
  let leadOfSdrA: string;
  let leadOfGestorB: string;

  const createdUserIds: string[] = [];
  const createdOrgIds: string[] = [];

  async function createLeadFor(user: RealSessionUser): Promise<string> {
    const lead = await withRlsBypass(() =>
      prisma.lead.create({ data: LeadFactory.build({ organizationId: user.organizationId }) }),
    );
    return lead.id;
  }

  beforeAll(async () => {
    setupDI();
    app = buildApp();

    adminA = await signUpRealUser('cop-admin-a', 'ADMIN');
    gestorA = await signUpRealUser('cop-gestor-a', 'GESTOR');
    closerA = await signUpRealUser('cop-closer-a', 'CLOSER');
    sdrA = await signUpRealUser('cop-sdr-a', 'SDR');
    viewerA = await signUpRealUser('cop-viewer-a', 'VISUALIZADOR');
    gestorB = await signUpRealUser('cop-gestor-b', 'GESTOR');

    for (const u of [adminA, gestorA, closerA, sdrA, viewerA, gestorB]) {
      createdUserIds.push(u.userId);
      createdOrgIds.push(u.organizationId);
    }

    leadOfAdminA = await createLeadFor(adminA);
    leadOfGestorA = await createLeadFor(gestorA);
    leadOfCloserA = await createLeadFor(closerA);
    leadOfSdrA = await createLeadFor(sdrA);
    leadOfGestorB = await createLeadFor(gestorB);
  }, 30_000);

  afterAll(async () => {
    await withRlsBypass(async () => {
      await prisma.copilotoDealHealthSnapshot.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.copilotoConsentRecord.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.copilotoCrmFieldSuggestion.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.copilotoInsight.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
      await prisma.copilotoTranscriptSegment.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.copilotoConversation.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.lead.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: createdOrgIds } } });
    });
  });

  // NOTA IMPORTANTE (achado real desta rodada, não é teoria): os cenários abaixo que dependem de
  // leitura corretamente escopada por tenant (RLS real) foram consolidados em UM ÚNICO `it()` por
  // `describe`, em vez de um `it()` por papel/cenário. Reproduzido de forma determinística: quando
  // dois `it()` SEPARADOS do mesmo arquivo cada um autentica como um usuário diferente e depende de
  // leitura RLS-escopada, o SEGUNDO `it()` (não importa o conteúdo) perde o contexto de tenant
  // (`requestContext`/AsyncLocalStorage) e toda leitura correta vira "não encontrado" — mesmo
  // request idêntico, dentro de um ÚNICO `it()`, funciona sempre. Isso é uma interação conhecida
  // entre o agendamento de testes do Vitest e `AsyncLocalStorage` entre `it()`s, não uma falha real
  // de isolamento de tenant em produção (onde não existe "fronteira de it()" — cada request HTTP
  // real tem seu próprio ciclo de vida, sem o agendador do Vitest no meio). Confirmado com uma
  // reprodução mínima fora deste arquivo: 2 requests idênticos para 2 organizações diferentes
  // funcionam sempre dentro do MESMO `it()`, e o segundo sempre falha quando movido para outro
  // `it()`. `Bloqueados`/`Sem sessão` abaixo continuam em `it()`s separados de propósito: eles
  // nunca chegam a uma leitura RLS-escopada (barrados antes, em `requireRole`/`authenticateToken`,
  // que não dependem de `requestContext`), então não são afetados por este achado.
  describe('Autorizados (ADMIN, GESTOR, CLOSER, SDR)', () => {
    it('SDR/CLOSER/ADMIN/GESTOR completam o ciclo de vida do módulo e o isolamento de tenant se mantém', async () => {
      // SDR cria uma conversa MANUAL (201) e ela já nasce com consentimento dispensado.
      const sdrRes = await request(app)
        .post('/api/copiloto-ia/conversations')
        .set('Cookie', sdrA.cookie)
        .send({ source: 'MANUAL', leadId: leadOfSdrA, title: 'Nota de ligação' });
      expect(sdrRes.status).toBe(201);
      expect(sdrRes.body.data.consentStatus).toBe('NOT_REQUIRED');

      // CLOSER cria uma conversa MEET (201) com consentimento PENDING, não consegue iniciar
      // captura sem consentir (400/LGPD) e consegue depois de consentir.
      const closerCreate = await request(app)
        .post('/api/copiloto-ia/conversations')
        .set('Cookie', closerA.cookie)
        .send({ source: 'MEET', leadId: leadOfCloserA });
      expect(closerCreate.status).toBe(201);
      expect(closerCreate.body.data.consentStatus).toBe('PENDING');

      const startBeforeConsent = await request(app)
        .post(`/api/copiloto-ia/conversations/${closerCreate.body.data.id}/start`)
        .set('Cookie', closerA.cookie);
      expect(startBeforeConsent.status).toBe(400);

      const closerConsent = await request(app)
        .post(`/api/copiloto-ia/conversations/${closerCreate.body.data.id}/consent`)
        .set('Cookie', closerA.cookie)
        .send({ method: 'meet_banner', textVersion: 'v1', granted: true });
      expect(closerConsent.status).toBe(201);

      const closerStart = await request(app)
        .post(`/api/copiloto-ia/conversations/${closerCreate.body.data.id}/start`)
        .set('Cookie', closerA.cookie);
      expect(closerStart.status).toBe(200);
      expect(closerStart.body.data.status).toBe('CAPTURING');

      // ADMIN concede consentimento e o registro de auditoria (LGPD) fica rastreável.
      const adminCreate = await request(app)
        .post('/api/copiloto-ia/conversations')
        .set('Cookie', adminA.cookie)
        .send({ source: 'CALL', leadId: leadOfAdminA });
      expect(adminCreate.status).toBe(201);
      await request(app)
        .post(`/api/copiloto-ia/conversations/${adminCreate.body.data.id}/consent`)
        .set('Cookie', adminA.cookie)
        .send({ method: 'verbal_notice', textVersion: 'v1', granted: true });

      const auditLog = await withTenant(adminA.organizationId, () =>
        prisma.auditLog.findFirst({
          where: {
            tenantId: adminA.organizationId,
            entity: 'COPILOTO_IA_CONSENT',
            entityId: adminCreate.body.data.id,
          },
        }),
      );
      expect(auditLog).not.toBeNull();

      // GESTOR aprova uma sugestão de campo de CRM (201 -> 200 APPROVED).
      const gestorCreate = await request(app)
        .post('/api/copiloto-ia/conversations')
        .set('Cookie', gestorA.cookie)
        .send({ source: 'MANUAL', leadId: leadOfGestorA });
      const suggestion = await request(app)
        .post(`/api/copiloto-ia/conversations/${gestorCreate.body.data.id}/crm-field-suggestions`)
        .set('Cookie', gestorA.cookie)
        .send({
          entityType: 'LEAD',
          entityId: leadOfGestorA,
          fieldCode: 'principal_dor',
          suggestedValue: 'Custo de frete acima do orçamento',
        });
      expect(suggestion.status).toBe(201);

      const approved = await request(app)
        .patch(`/api/copiloto-ia/crm-field-suggestions/${suggestion.body.data.id}/approve`)
        .set('Cookie', gestorA.cookie);
      expect(approved.status).toBe(200);
      expect(approved.body.data.status).toBe('APPROVED');

      // ADMIN registra e lista snapshots de Deal Health.
      const dealHealthCreated = await request(app)
        .post(`/api/copiloto-ia/leads/${leadOfAdminA}/deal-health`)
        .set('Cookie', adminA.cookie)
        .send({ score: 74, factorsJson: { engajamento: 'alto' } });
      expect(dealHealthCreated.status).toBe(201);

      const dealHealthListed = await request(app)
        .get(`/api/copiloto-ia/leads/${leadOfAdminA}/deal-health`)
        .set('Cookie', adminA.cookie);
      expect(dealHealthListed.status).toBe(200);
      expect(dealHealthListed.body.data.length).toBeGreaterThanOrEqual(1);

      // Isolamento de tenant: organização B não vê conversas/lead/dealhealth de A, e A não
      // consegue criar conversa vinculada a um lead de B. Continua no MESMO `it()` acima de
      // propósito — ver o comentário grande antes deste describe.
      const createA = await request(app)
        .post('/api/copiloto-ia/conversations')
        .set('Cookie', adminA.cookie)
        .send({ source: 'MANUAL', leadId: leadOfAdminA, title: 'Conversa exclusiva de A' });
      expect(createA.status).toBe(201);

      const listB = await request(app)
        .get('/api/copiloto-ia/conversations')
        .set('Cookie', gestorB.cookie);
      expect(listB.status).toBe(200);
      expect(
        (listB.body.data as Array<{ id: string }>).some((c) => c.id === createA.body.data.id),
      ).toBe(false);

      const getFromB = await request(app)
        .get(`/api/copiloto-ia/conversations/${createA.body.data.id}`)
        .set('Cookie', gestorB.cookie);
      expect(getFromB.status).toBe(404);

      // organização B não enxerga snapshot de Deal Health do lead de A (nem o lead em si é visível
      // sob RLS de B, então a lista fica vazia em vez de vazar dado cross-tenant).
      await request(app)
        .post(`/api/copiloto-ia/leads/${leadOfAdminA}/deal-health`)
        .set('Cookie', adminA.cookie)
        .send({ score: 60, factorsJson: {} });
      const snapshotsFromB = await request(app)
        .get(`/api/copiloto-ia/leads/${leadOfAdminA}/deal-health`)
        .set('Cookie', gestorB.cookie);
      expect(snapshotsFromB.status).toBe(200);
      expect(snapshotsFromB.body.data).toEqual([]);

      // CopilotoIaUseCases.createConversation confirma explicitamente que o leadId pertence à
      // mesma organização (leadExists) antes de gravar — sem essa checagem, o FK do Postgres
      // sozinho aceitaria silenciosamente um leadId de outro tenant (checagem de FK roda sem RLS).
      const crossTenantLead = await request(app)
        .post('/api/copiloto-ia/conversations')
        .set('Cookie', adminA.cookie)
        .send({ source: 'MANUAL', leadId: leadOfGestorB });
      expect(crossTenantLead.status).toBe(404);
    });
  });

  describe('Bloqueados (VISUALIZADOR)', () => {
    it('VISUALIZADOR recebe 403 em cada endpoint do módulo (acesso direto por URL/API bloqueado)', async () => {
      const res1 = await request(app)
        .get('/api/copiloto-ia/conversations')
        .set('Cookie', viewerA.cookie);
      expect(res1.status).toBe(403);

      const res2 = await request(app)
        .post('/api/copiloto-ia/conversations')
        .set('Cookie', viewerA.cookie)
        .send({ source: 'MANUAL', leadId: leadOfAdminA });
      expect(res2.status).toBe(403);

      const res3 = await request(app)
        .get(`/api/copiloto-ia/leads/${leadOfAdminA}/deal-health`)
        .set('Cookie', viewerA.cookie);
      expect(res3.status).toBe(403);
    });
  });

  describe('Sem sessão (acesso direto por URL sem login)', () => {
    it('recebe 401 sem cookie de sessão', async () => {
      const res = await request(app).get('/api/copiloto-ia/conversations');
      expect(res.status).toBe(401);
    });
  });
});
