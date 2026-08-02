import { config } from 'dotenv';
import path from 'path';

// Load test environment variables before Prisma initializes
config({ path: path.resolve(process.cwd(), '.env.test') });

import { vi, beforeAll, afterAll, afterEach } from 'vitest';

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
    // A policy de RLS de Organization exige app.current_tenant_id = id (ver
    // 20260722020322_enable_rls/migration.sql) — sem contexto de tenant, o insert é
    // bloqueado mesmo antes da organização existir. Como é a própria org sendo criada,
    // usamos o id dela como tenantId do contexto (mesma condição que a policy checa).
    await requestContext.run({ tenantId: 'test-org-id' }, async () => {
        const exists = await prisma.organization.findUnique({ where: { id: 'test-org-id' } });
        if (!exists) {
            await prisma.organization.create({
                data: { id: 'test-org-id', name: 'Test Org' },
            });
        }
    });
};

beforeAll(async () => {
  await seedDatabase();
  await cleanDatabase();
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
