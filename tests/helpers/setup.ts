import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock do BullMQ para que testes unitários não tentem conectar no Redis real (evitando warnings "searchQueue offline")
vi.mock('bullmq', async (importOriginal) => {
  const actual = await importOriginal<typeof import('bullmq')>();
  return {
    ...actual,
    Queue: vi.fn().mockImplementation((name) => ({
      name,
      add: vi.fn().mockResolvedValue({ id: 'mocked-job-id' }),
      on: vi.fn(),
      close: vi.fn(),
    })),
    Worker: vi.fn().mockImplementation((name, processor) => ({
      name,
      on: vi.fn(),
      close: vi.fn(),
    })),
    QueueEvents: vi.fn().mockImplementation((name) => ({
      name,
      on: vi.fn(),
      close: vi.fn(),
    })),
  };
});

// Removed global vi.mock('@/lib/prisma') as it breaks integration tests.
// Unit tests already mock Prisma explicitly.
