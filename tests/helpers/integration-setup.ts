import { config } from 'dotenv';
import path from 'path';

// Load test environment variables before Prisma initializes
config({ path: path.resolve(process.cwd(), '.env.test') });

// Seatbelt: se .env.test não existir (ou estiver desatualizado) — por exemplo, alguém rodando
// `vitest run -c vitest.integration.config.ts` direto, sem passar pelo `pretest:integration` que
// prepara o arquivo — DATABASE_URL cai de volta pro que já estiver no processo, que numa máquina
// de dev normalmente aponta pro banco de desenvolvimento de verdade ("prospectordb"). O afterAll()
// abaixo faz `prisma.organization.deleteMany()` SEM where; rodar isso contra o banco de dev real
// apaga todas as organizações e, por causa do ON DELETE CASCADE em BitrixConnection/BitrixSyncRule
// (diferente do ON DELETE SET NULL em Company/Contact/Lead), destrói silenciosamente toda conexão
// Bitrix24 salva. Recusar rodar fora de um banco cujo nome sinalize claramente "teste" é mais
// seguro do que confiar que .env.test sempre vai existir e estar correto.
const databaseUrl = process.env.DATABASE_URL ?? '';
if (!/\/[\w-]*test[\w-]*(\?|$)/i.test(databaseUrl)) {
  throw new Error(
    `Testes de integração recusaram rodar: DATABASE_URL não aponta para um banco de teste isolado ` +
    `(esperado um nome de banco contendo "test", ex: "prospectordb_test"; recebido "${databaseUrl || '(vazio)'}"). ` +
    `Rode via "npm run test:integration" (que prepara .env.test automaticamente) em vez de invocar o vitest direto.`,
  );
}

import { vi, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';

// Mock meilisearch completely so Prisma triggers won't fail
vi.mock('../../src/lib/search/index.js', () => ({
  meili: {
    index: () => ({
      addDocuments: vi.fn().mockResolvedValue({}),
      updateDocuments: vi.fn().mockResolvedValue({}),
      deleteDocuments: vi.fn().mockResolvedValue({}),
    })
  }
}));

import { prisma } from '../../src/lib/prisma';
import { requestContext } from '../../src/lib/async-context';

// Roda fora de qualquer request HTTP, então não há tenantId nem sessão do Better Auth por trás
// dessas queries — sem bypassRls elas seriam bloqueadas pelas mesmas policies de FORCE ROW LEVEL
// SECURITY que protegem Organization/User em produção (ver src/lib/async-context.ts).
const withRlsBypass = <T>(fn: () => Promise<T>): Promise<T> =>
  requestContext.run({ bypassRls: true }, fn);

// Real database cleanup for integration tests.
//
// ITEM-02 (remediação de dívida técnica P0): Company/Contact/Activity/Note/TimelineEvent NÃO estão
// no allowlist de bypass (BYPASS_RLS_ALLOWED_MODELS, src/lib/prisma.ts) — a RLS real dessas tabelas
// fechou pra bypass, tanto leitura quanto escrita (migration
// 20260825120000_scope_rls_bypass_to_bootstrap_allowlist). Um `deleteMany()` sob bypass, sem
// `where`, agora afeta 0 linhas silenciosamente nessas tabelas (RLS nega por falta de tenant), o
// que quebraria a limpeza global entre testes de toda a suíte. `Lead` continua no allowlist, mas
// roda no mesmo laço por tenant por consistência (evita depender de dois caminhos diferentes).
// `Organization` continua no allowlist — usada aqui só para descobrir QUAIS tenants existem no
// banco de teste no momento (a mesma descoberta cross-tenant já legítima em outros bootstraps,
// ver src/lib/prisma.ts), nunca para ler/escrever dado de negócio de um tenant.
const cleanDatabase = async () => {
  const orgs = await withRlsBypass(() => prisma.organization.findMany({ select: { id: true } }));
  for (const { id: tenantId } of orgs) {
    await requestContext.run({ tenantId }, async () => {
      await prisma.timelineEvent.deleteMany();
      await prisma.activity.deleteMany();
      await prisma.note.deleteMany();
      await prisma.lead.deleteMany();
      await prisma.contact.deleteMany();
      await prisma.company.deleteMany();
    });
  }
};

const seedDatabase = async () => withRlsBypass(async () => {
    // Add default test organization to resolve foreign key constraints
    const exists = await prisma.organization.findUnique({ where: { id: 'test-org-id' } });
    if (!exists) {
      await prisma.organization.create({
        data: { id: 'test-org-id', name: 'Test Org' },
      });
    }
});

beforeAll(async () => {
  await seedDatabase();
  await cleanDatabase();
});

// A maioria dos testes de integração chama use-cases/repositórios direto (sem passar pelo
// Express), então não há authenticateToken pra popular o requestContext com o tenant, como
// acontece numa requisição real. enterWith (ao contrário de run) não precisa de um callback
// envolvendo o teste inteiro — aplica o tenant padrão pro resto da execução do teste atual, o
// suficiente pra RLS deixar passar as queries tenant-scoped que esses testes exercitam. Testes que
// precisam de outro tenant ou de bypass (ex.: tests/integration/tenant-isolation-db001.test.ts)
// sobrescrevem isso explicitamente com requestContext.run(...).
beforeEach(() => {
  requestContext.enterWith({ tenantId: 'test-org-id' });
});

afterEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await cleanDatabase();
  await withRlsBypass(async () => {
    try {
      await prisma.user.deleteMany();
    } catch (error) {
      void error;
    }
    await prisma.organization.deleteMany();
  });
  await prisma.$disconnect();
});
