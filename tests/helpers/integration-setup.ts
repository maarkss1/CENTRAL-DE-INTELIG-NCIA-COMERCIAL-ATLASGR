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

const runWithBypassRls = async <T>(fn: () => Promise<T>): Promise<T> =>
  requestContext.run({ bypassRls: true }, fn);

// Real database cleanup for integration tests
const cleanDatabase = async () => {
  await runWithBypassRls(async () => {
    await prisma.timelineEvent.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.note.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.contact.deleteMany();
    await prisma.company.deleteMany();
  });
};

const seedDatabase = async () => {
  await runWithBypassRls(async () => {
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

beforeEach(() => {
  requestContext.enterWith({ bypassRls: true });
});

afterEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await cleanDatabase();
  await runWithBypassRls(async () => {
    try {
      await prisma.user.deleteMany();
    } catch (e) {}
    await prisma.organization.deleteMany();
  });
  await prisma.$disconnect();
});
