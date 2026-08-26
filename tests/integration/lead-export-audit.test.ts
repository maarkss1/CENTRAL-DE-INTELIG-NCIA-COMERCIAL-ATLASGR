import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';

import { prisma } from '../../src/lib/prisma';
import { authenticateToken } from '../../src/shared/middlewares/authenticateToken';
import { requireTenant } from '../../src/shared/middlewares/authorization';
import { leadRoutes } from '../../src/features/crm/routes/lead.routes';
import { errorHandler } from '../../src/shared/middlewares/errorHandler';
import { applyRateLimiters } from '../../src/bootstrap/rateLimiters';
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

// auditAccessMiddleware grava o AuditLog num listener de `res.on('finish')` sem aguardar a Promise
// (fire-and-forget, mesmo padrão de todo outro chamador de AuditService.log no projeto — não
// bloqueia a resposta HTTP por causa da auditoria). supertest resolve assim que a resposta termina,
// antes da escrita no Postgres ter necessariamente concluído — poll curto e limitado em vez de uma
// race condition contra o banco (tests/unit/lib/security/auditLog.middleware.test.ts usa só um
// `setImmediate` porque lá AuditService é mockado; aqui é uma escrita real).
//
// Usa withTenant (não withRlsBypass) para ler: a migration 20260825120000_scope_rls_bypass_to_
// bootstrap_allowlist removeu a cláusula "OR bypass_rls='on'" também do USING de AuditLog, não só
// do WITH CHECK — bypassRls não tem mais nenhum efeito de leitura nessa tabela (achado real, via
// CI: a escrita confirmadamente aconteceu com o tenantId correto, mas a query sob bypass sempre
// devolvia 0 linhas, sem nenhum erro — RLS filtra silenciosamente no SELECT).
async function waitForAuditLog(tenantId: string, where: Parameters<typeof prisma.auditLog.findMany>[0]['where']) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const logs = await withTenant(tenantId, () => prisma.auditLog.findMany({ where }));
    if (logs.length > 0) return logs;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return withTenant(tenantId, () => prisma.auditLog.findMany({ where }));
}

function buildLeadApp(): Express {
  const app = express();
  app.use(express.json());
  // Mesmo apiLimiter que o composition root real aplica em '/api' antes de qualquer rota de
  // feature (ver src/bootstrap/rateLimiters.ts) — sem isto, este harness isolado de supertest não
  // reflete a topologia real e o CodeQL sinaliza (corretamente, para o app aqui montado) a rota
  // como sem rate limiting.
  applyRateLimiters(app);
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
    // AuditLog não aceita mais bypass de RLS nem para leitura/limpeza (ver comentário em
    // waitForAuditLog) — apaga por tenant, um de cada vez.
    for (const orgId of createdOrgIds) {
      await withTenant(orgId, () => prisma.auditLog.deleteMany({ where: { tenantId: orgId } }));
    }
    await withRlsBypass(async () => {
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

    const logs = await waitForAuditLog(adminA.organizationId, { tenantId: adminA.organizationId, entity: 'Lead', action: 'EXPORT' });
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].actorId).toBe(adminA.userId);
    expect(logs[0].tenantId).toBe(adminA.organizationId);
  });

  it('SDR (fora de managementRoles): 403 do requireRole real, sem AuditLog gravado', async () => {
    const before = await withTenant(vendedorA.organizationId, () =>
      prisma.auditLog.count({ where: { tenantId: vendedorA.organizationId, entity: 'Lead', action: 'EXPORT' } })
    );

    const res = await request(app)
      .get('/api/leads/export/csv')
      .set('Cookie', vendedorA.cookie);

    expect(res.status).toBe(403);

    const after = await withTenant(vendedorA.organizationId, () =>
      prisma.auditLog.count({ where: { tenantId: vendedorA.organizationId, entity: 'Lead', action: 'EXPORT' } })
    );
    // auditAccessMiddleware só está depois de managementRoles na cadeia — um 403 do requireRole
    // nem chega a rodar o middleware de auditoria (res.on('finish') só grava se statusCode < 400
    // de qualquer forma, mas o próprio next() do middleware de auditoria nunca é alcançado aqui).
    expect(after).toBe(before);
  });
});
