import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';

import { prisma } from '../../src/lib/prisma';
import { requestContext } from '../../src/lib/async-context';
import { auth } from '../../src/lib/auth';
import { authenticateToken } from '../../src/shared/middlewares/authenticateToken';
import { requireTenant } from '../../src/shared/middlewares/authorization';
import { leadRoutes } from '../../src/features/crm/routes/lead.routes';
import { errorHandler } from '../../src/shared/middlewares/errorHandler';
import { setupDI } from '../../src/shared/di/setup';
import { LeadFactory } from '../helpers/factories';

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

// DEFAULT_TENANT_ID: mesmo valor que tests/helpers/integration-setup.ts usa no `beforeEach`
// global (`requestContext.enterWith({ tenantId: 'test-org-id' })`). Usamos `enterWith` aqui (não
// `requestContext.run`) de propósito: `.run()` abre um novo frame de AsyncLocalStorage para o
// callback, e — verificado manualmente neste ambiente (Prisma 7 + @prisma/adapter-pg + o
// `$transaction([setConfig, query])` de src/lib/prisma.ts) — a continuação assíncrona de uma
// chamada Prisma real nem sempre "ficou" dentro desse frame novo depois de atravessar o driver;
// o resultado prático era a query rodar com o `tenantId`/`bypassRls` ANTERIOR (o do `enterWith`
// global do `beforeEach`), não o do `.run()`. `enterWith` chamado aqui, no mesmo frame que já
// está ativo (o mesmo padrão que o `beforeEach` global e todos os outros testes de integração já
// usam com sucesso), não tem esse problema. Sempre restauramos pro tenant padrão depois de cada
// operação, pra não vazar pro resto do teste.
const DEFAULT_TENANT_ID = 'test-org-id';

async function withRlsBypass<T>(fn: () => Promise<T>): Promise<T> {
  requestContext.enterWith({ bypassRls: true });
  try {
    return await fn();
  } finally {
    requestContext.enterWith({ tenantId: DEFAULT_TENANT_ID });
  }
}

async function withTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  requestContext.enterWith({ tenantId });
  try {
    return await fn();
  } finally {
    requestContext.enterWith({ tenantId: DEFAULT_TENANT_ID });
  }
}

const TEST_PASSWORD = 'RbacTestPassword123!';

// Domínio @atlasgr.com.br: é o único jeito de passar por
// `isAuthorizedLoginEmail` (src/config/access-policy.ts), checado tanto pelo
// databaseHooks.user.create.before do better-auth (src/lib/auth.ts) quanto por
// databaseHooks.session.create.before — um e-mail fora do domínio autorizado faz o
// signUpEmail falhar com 403 antes mesmo de chegarmos à parte de RBAC que este teste cobre.
function uniqueEmail(prefix: string): string {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  return `rbac-${prefix}-${unique}@atlasgr.com.br`;
}

interface RealSessionUser {
  userId: string;
  organizationId: string;
  /** Header `Cookie` pronto pra usar em supertest — cookie de sessão REAL, assinado pelo better-auth. */
  cookie: string;
}

/**
 * Cria um usuário real via `auth.api.signUpEmail` (mesmo caminho que o formulário de cadastro
 * usa em produção — dispara os mesmos databaseHooks que criam a Organization e validam o
 * domínio do e-mail) e devolve o cookie de sessão REAL emitido pelo better-auth
 * (`setSessionCookie`, ver node_modules/better-auth/dist/cookies/index.mjs), extraído do
 * `Set-Cookie` devolvido via `returnHeaders: true` — nunca um valor fabricado à mão, que não
 * bateria com a assinatura HMAC que `auth.api.getSession()` valida.
 *
 * Usamos `returnHeaders: true` (não `asResponse: true`): com `asResponse`, better-call
 * constrói um `Response` de verdade (via `toResponse`/undici) e isso — verificado manualmente
 * neste ambiente — faz o `AsyncLocalStorage` de `requestContext` (src/lib/async-context.ts)
 * perder o `enterWith({ tenantId })` que o hook `databaseHooks.user.create.before`
 * (src/lib/auth.ts) depende para o INSERT de Organization passar pela RLS, e o signup falha com
 * "new row violates row-level security policy for table Organization". `returnHeaders: true`
 * devolve `{ response, headers }` sem passar por `toResponse`, preservando o contexto — e é
 * exatamente o mesmo objeto de headers que o `Set-Cookie` real carrega.
 *
 * O usuário nasce com o role padrão (`VISUALIZADOR`, ver additionalFields em src/lib/auth.ts);
 * quando o teste precisa de outro role, ele é promovido depois via update direto no Prisma,
 * dentro do tenant do próprio usuário (`withTenant`, sem precisar de bypass — o `organizationId`
 * já vem no `user` devolvido pelo signup) — só pra reduzir o setup, RBAC continua sendo decidido
 * em runtime pelo `requireRole` real a partir do role persistido no banco, não por nada fabricado
 * no teste.
 *
 * Importante: signup + a eventual promoção de role acontecem dentro do MESMO
 * `withRlsBypass` (um único bloco `enterWith` envolvendo os dois `await`s) — chamadas
 * separadas (um `withRlsBypass`/`withTenant` novo, depois de já ter dado `await` no primeiro)
 * não enxergaram de forma confiável a escrita que tinha acabado de acontecer nesta versão do
 * Prisma/adapter-pg (a query rodava, mas via RLS filtrava tudo — 0 linhas afetadas/encontradas
 * — mesmo com o contexto certo). Mantendo as duas escritas na mesma árvore de `AsyncLocalStorage`
 * evita esse problema; `userId`/`organizationId` continuam vindo da própria resposta do
 * signUpEmail, nunca de uma releitura à parte.
 */
async function signUpRealUser(prefix: string, role: 'ADMIN' | 'GESTOR' | 'VENDEDOR' | 'VISUALIZADOR'): Promise<RealSessionUser> {
  const email = uniqueEmail(prefix);

  const { payload, headers } = await withRlsBypass(async () => {
    const { response, headers } = await auth.api.signUpEmail({
      body: { email, password: TEST_PASSWORD, name: `RBAC Test ${prefix}` },
      returnHeaders: true,
    }) as { response: { user: { id: string; organizationId: string; role: string } }; headers: Headers };

    if (response.user.role !== role) {
      await prisma.user.update({ where: { id: response.user.id }, data: { role } });
    }

    return { payload: response.user, headers };
  });

  const rawSetCookies: string[] = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : (headers.get('set-cookie') ? [headers.get('set-cookie') as string] : []);

  if (rawSetCookies.length === 0) {
    throw new Error(`signUpEmail não retornou Set-Cookie para ${email} — sem sessão real pra reaproveitar.`);
  }

  const cookie = rawSetCookies.map((raw) => raw.split(';')[0]).join('; ');
  const { id: userId, organizationId } = payload;

  return { userId, organizationId, cookie };
}

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

  it('(c-bis) GESTOR também tem role suficiente para deletar (hierarquia ADMIN > GESTOR > VENDEDOR > VISUALIZADOR)', async () => {
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
