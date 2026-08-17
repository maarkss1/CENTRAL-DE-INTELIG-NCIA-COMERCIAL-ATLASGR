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

// TEST-006 (dívida técnica): RBAC ponta-a-ponta numa rota REAL.
//
// Ao contrário de tests/unit/features/companies/routes/company.routes.test.ts (que injeta
// `req.user` via um middleware fake e nunca exercita autenticação de verdade), este teste monta
// o Express real com `authenticateToken` + `requireTenant` + `requireRole` tal como
// `server.ts` monta `/api/leads`, e autentica cada usuário com uma sessão REAL do better-auth
// (cookie assinado por `setSessionCookie`, extraído de um `/sign-up/email` real via
// `auth.api.signUpEmail({ returnHeaders: true })` — não um token fabricado à mão). Isso cobre a
// cadeia completa: cookie -> `auth.api.getSession()` -> `req.user` -> `requireRole` ->
// controller -> repositório -> Postgres com RLS (`app.current_tenant_id`) real.
//
// Requer Postgres real via `.env.test` (ver tests/helpers/integration-setup.ts).

// withRlsBypass/withTenant/signUpRealUser: ver tests/helpers/rbac-e2e-helpers.ts (extraído deste
// arquivo — mesmo comportamento, agora reutilizado por outros specs de RBAC ponta-a-ponta como
// tests/integration/rbac-e2e-crm-operations.test.ts).

function buildLeadsApp(): Express {
  const app = express();
  app.use(express.json());
  // Mesma cadeia de middlewares reais que server.ts monta em `/api/leads`
  // (authenticateToken, requireTenant, e requireRole dentro de lead.routes.ts no DELETE).
  app.use('/api/leads', authenticateToken, requireTenant, leadRoutes);
  app.use(errorHandler);
  return app;
}

async function createLead(organizationId: string): Promise<{ id: string }> {
  return withTenant(organizationId, () =>
    prisma.lead.create({ data: LeadFactory.build() }) as unknown as Promise<{ id: string }>
  );
}

describe('RBAC ponta-a-ponta em DELETE /api/leads/:id (TEST-006)', () => {
  let app: Express;

  let adminA: RealSessionUser;
  let viewerA: RealSessionUser;
  let adminB: RealSessionUser;

  const createdUserIds: string[] = [];
  const createdOrgIds: string[] = [];

  beforeAll(async () => {
    setupDI();
    app = buildLeadsApp();

    adminA = await signUpRealUser('admin-a', 'ADMIN');
    viewerA = await signUpRealUser('viewer-a', 'VISUALIZADOR');
    adminB = await signUpRealUser('admin-b', 'ADMIN');

    for (const u of [adminA, viewerA, adminB]) {
      createdUserIds.push(u.userId);
      createdOrgIds.push(u.organizationId);
    }
  }, 30_000);

  afterAll(async () => {
    await withRlsBypass(async () => {
      await prisma.lead.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: createdOrgIds } } });
    });
  });

  it('(a) sem sessão nenhuma: DELETE retorna 401, sem chegar em requireRole/controller', async () => {
    const res = await request(app).delete('/api/leads/nao-importa-qual-id');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, error: 'Autenticação necessária.' });
  });

  it('(b) autenticado mas sem role suficiente: VISUALIZADOR tentando deletar recebe 403 do requireRole real', async () => {
    const lead = await createLead(viewerA.organizationId);

    const res = await request(app)
      .delete(`/api/leads/${lead.id}`)
      .set('Cookie', viewerA.cookie);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    // Mensagem vem literalmente de requireRole.ts — prova que quem decidiu foi o middleware real,
    // não um stub.
    expect(res.body.error).toBe('Insufficient permissions. Required: ADMIN or GESTOR. Your role: VISUALIZADOR.');

    // E o lead continua vivo — o 403 barrou antes de qualquer escrita no banco.
    const stillThere = await withTenant(viewerA.organizationId, () => prisma.lead.findUnique({ where: { id: lead.id } }));
    expect(stillThere?.deletedAt).toBeNull();
  });

  it('(c) role suficiente (ADMIN) no próprio tenant: DELETE é executado de verdade (204) e o lead some da listagem', async () => {
    const lead = await createLead(adminA.organizationId);

    const deleteRes = await request(app)
      .delete(`/api/leads/${lead.id}`)
      .set('Cookie', adminA.cookie);

    expect(deleteRes.status).toBe(204);

    // Confirma a ação de verdade: o repositório faz soft delete (ver src/lib/prisma.ts,
    // extensão isAuditable) — a linha continua existindo na tabela, mas a própria extensão do
    // Prisma filtra qualquer `findUnique`/`findMany` com `deletedAt` preenchido, devolvendo
    // null/[] — por isso, direto no banco (mesmo cliente que a rota usa), o lead já não é mais
    // "encontrável". (Não usamos GET /api/leads/:id aqui pra confirmar o 404: nesta cópia do
    // banco de teste, `PrismaLeadRepository.findById` seleciona colunas de Company que estão
    // fora de sincronia com as migrations aplicadas — "column Company.newsMentions does not
    // exist" —, um drift de schema pré-existente e sem relação com RBAC/TEST-006. A verificação
    // direta no banco acima já comprova a exclusão de verdade.)
    const afterDelete = await withTenant(adminA.organizationId, () => prisma.lead.findUnique({ where: { id: lead.id } }));
    expect(afterDelete).toBeNull();
  });

  it('(d) isolamento de tenant: ADMIN da Org B não consegue deletar lead da Org A (requireTenant/organizationId real)', async () => {
    const leadFromOrgA = await createLead(adminA.organizationId);

    const res = await request(app)
      .delete(`/api/leads/${leadFromOrgA.id}`)
      .set('Cookie', adminB.cookie);

    // requireRole deixa passar (adminB tem role ADMIN) — quem barra aqui é o filtro explícito de
    // organizationId em PrismaLeadRepository.delete (findFirst({ id, organizationId }) não acha
    // nada de outro tenant e lança 'Lead not found', que o errorHandler genérico mapeia pra 500
    // por não ser um AppError/Prisma P2025 — ver src/shared/middlewares/errorHandler.ts).
    // O que importa pro RBAC/tenant-isolation é que a ação NÃO teve efeito nenhum, verificado
    // abaixo direto no banco.
    expect(res.status).not.toBe(204);
    expect(res.body.success).toBe(false);

    const untouched = await withTenant(adminA.organizationId, () => prisma.lead.findUnique({ where: { id: leadFromOrgA.id } }));
    expect(untouched).not.toBeNull();
    expect(untouched?.deletedAt).toBeNull();
    expect(untouched?.organizationId).toBe(adminA.organizationId);
  });

  it('(c-bis) GESTOR também tem role suficiente para deletar (hierarquia ADMIN > GESTOR > CLOSER > SDR > VISUALIZADOR)', async () => {
    const gestor = await signUpRealUser('gestor-a', 'GESTOR');
    createdUserIds.push(gestor.userId);
    createdOrgIds.push(gestor.organizationId);

    const lead = await createLead(gestor.organizationId);

    const res = await request(app)
      .delete(`/api/leads/${lead.id}`)
      .set('Cookie', gestor.cookie);

    expect(res.status).toBe(204);
  });
});
