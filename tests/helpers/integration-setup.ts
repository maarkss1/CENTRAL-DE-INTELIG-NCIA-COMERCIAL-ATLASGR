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

const withBypassRls = <T>(callback: () => Promise<T>): Promise<T> => {
  return requestContext.run({ bypassRls: true }, callback);
};

// Real database cleanup for integration tests
const cleanDatabase = async () => {
  await withBypassRls(async () => {
    // Use a transaction or specific deletion order if needed
    await prisma.timelineEvent.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.note.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.contact.deleteMany();
    await prisma.company.deleteMany();
  });
};

const seedDatabase = async () => {
    await withBypassRls(async () => {
    // Add default test organization to resolve foreign key constraints
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
  await withBypassRls(async () => {
    try {
      await prisma.user.deleteMany();
    } catch (error) {
      void error;
    }
    await prisma.organization.deleteMany();
  });
  await prisma.$disconnect();
});
