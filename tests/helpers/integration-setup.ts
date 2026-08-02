import { config } from 'dotenv';
import path from 'path';

// Load test environment variables before Prisma initializes
config({ path: path.resolve(process.cwd(), '.env.test') });

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

// Real database cleanup for integration tests
const cleanDatabase = async () => withRlsBypass(async () => {
  // Use a transaction or specific deletion order if needed
  await prisma.timelineEvent.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.note.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.company.deleteMany();
});

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
    } catch (e) {}
    await prisma.organization.deleteMany();
  });
  await prisma.$disconnect();
});
