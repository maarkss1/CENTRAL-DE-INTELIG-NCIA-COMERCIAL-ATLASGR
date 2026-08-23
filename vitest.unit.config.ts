import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/mocks/setup.ts'],
    // Forkar um processo para cada arquivo tornou a suíte de ~160 arquivos aparentemente
    // travada em hosts com poucos CPUs: o custo de bootstrap do Node/jsdom dominava os testes.
    // Threads continuam isoladas pelo Vitest, reduzem esse custo e o limite explícito impede que
    // o gate dispute todos os recursos com outros worktrees da mesma onda.
    pool: 'threads',
    maxWorkers: 2,
    include: ['tests/unit/**/*.test.ts', 'src/**/__tests__/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['src/main.tsx', 'src/**/*.d.ts', 'src/components/**', 'src/features/**/*.tsx'],
    },
  },
});
