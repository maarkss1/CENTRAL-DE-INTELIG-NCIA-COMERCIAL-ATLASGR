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

// Os testes de integração chamam use cases/repositórios/prisma diretamente, sem passar pelo
// middleware authenticateToken.ts (que é quem, em produção, faz requestContext.run({ tenantId, ... })
// antes de qualquer query). Desde que Organization/Company/Contact/Lead/... passaram a ter FORCE ROW
// LEVEL SECURITY (ver prisma/migrations/20260722020322_enable_rls e seguintes), qualquer INSERT feito
// sem esse contexto é rejeitado pela policy — src/lib/prisma.ts só seta app.bypass_rls/
// app.current_tenant_id quando requestContext tem tenantId/bypassRls. Entramos no mesmo contexto aqui,
// via enterWith (singleThread: true no vitest.integration.config.ts garante que persiste pros hooks e
// testes seguintes), simulando o que o middleware já faz de verdade em produção.
const enterTestRequestContext = () => {
  requestContext.enterWith({ tenantId: 'test-org-id', userId: 'test-integration-user', bypassRls: true });
};

// Real database cleanup for integration tests
const cleanDatabase = async () => {
  // Use a transaction or specific deletion order if needed
  await prisma.timelineEvent.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.note.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.company.deleteMany();
};

const seedDatabase = async () => {
    // Add default test organization to resolve foreign key constraints
    const exists = await prisma.organization.findUnique({ where: { id: 'test-org-id' } });
    if (!exists) {
        await prisma.organization.create({
            data: { id: 'test-org-id', name: 'Test Org' },
        });
    }
};

beforeAll(async () => {
  enterTestRequestContext();
  await seedDatabase();
  await cleanDatabase();
});

beforeEach(() => {
  enterTestRequestContext();
});

afterEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await cleanDatabase();
  try {
      await prisma.user.deleteMany();
  } catch(e) {}
  await prisma.organization.deleteMany();
  await prisma.$disconnect();
});
