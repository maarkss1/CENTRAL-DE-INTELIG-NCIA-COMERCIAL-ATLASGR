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

// Os testes de integração assumem, historicamente, acesso irrestrito ao banco (rodavam como
// superusuário, que ignora RLS) — o que testam de verdade é o filtro explícito de organizationId
// no código da aplicação (ver docstring de tests/integration/tenant-isolation-db001.test.ts), não
// a policy de RLS do Postgres em si, e vários testes criam dados de mais de um tenant na mesma
// execução. Ligar bypassRls globalmente restaura esse comportamento agora que o papel usado em
// CI (prospector_app) é NOSUPERUSER e as policies de RLS passaram a valer de verdade (N1).
// vitest.integration.config.ts roda os testes com singleThread+fileParallelism desligados, então
// não há corrida entre AsyncLocalStorage de testes diferentes.
const withBypassRls = <T>(fn: () => Promise<T>) => requestContext.run({ bypassRls: true }, fn);

// Real database cleanup for integration tests
const cleanDatabase = () => withBypassRls(async () => {
  // Use a transaction or specific deletion order if needed
  await prisma.timelineEvent.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.note.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.company.deleteMany();
});

const seedDatabase = () => withBypassRls(async () => {
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

// Cobre o corpo de cada `it(...)`: setado antes de cada teste, persiste através dos awaits
// subsequentes (incluindo o próprio teste e o afterEach) por como AsyncLocalStorage.enterWith
// funciona — sem isso, cada teste precisaria envolver manualmente suas próprias chamadas Prisma.
beforeEach(() => {
  requestContext.enterWith({ bypassRls: true });
});

afterEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await cleanDatabase();
  await withBypassRls(async () => {
    try {
      await prisma.user.deleteMany();
    } catch {
      // Alguns cenários de teste já limpam User por conta própria; ignora se não houver nada.
    }
    await prisma.organization.deleteMany();
  });
  await prisma.$disconnect();
});
