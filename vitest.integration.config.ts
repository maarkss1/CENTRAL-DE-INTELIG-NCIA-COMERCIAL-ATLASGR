import { defineConfig } from 'vitest/config';
import { config as loadEnv } from 'dotenv';
import path from 'path';

// Precisa estar setado em process.env ANTES do grafo de módulos ser avaliado: src/lib/prisma.ts lê
// DATABASE_URL no top-level do módulo (na criação do Pool), e ES modules avaliam todos os imports
// de um arquivo antes das próprias instruções desse arquivo — então um `dotenv.config()` chamado
// de dentro do setupFile roda tarde demais, depois que o Pool já foi criado com a URL errada
// (o fallback fixo do prisma.ts, porta 5432, onde nada está escutando). Carregar aqui, na config do
// Vitest (que roda antes de qualquer módulo de teste ser importado), resolve isso de vez.
const testEnv = loadEnv({ path: path.resolve(process.cwd(), '.env.test') }).parsed || {};

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    env: testEnv,
    // tests/helpers/integration-setup.ts seeds the "test-org-id" Organization that every
    // integration test's fixtures depend on (foreign key) and cleans up before/after each test -
    // it existed but was never wired here, so on a genuinely fresh DB (like CI) every test failed
    // with a foreign key violation the first time nothing had happened to create that row yet.
    setupFiles: ['./tests/helpers/integration-setup.ts'],
    fileParallelism: false,
    singleThread: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['src/main.tsx', 'src/**/*.d.ts', 'src/components/**', 'src/features/**/*.tsx'],
    },
    alias: {
      '@/': new URL('./src/', import.meta.url).pathname,
    }
  },
});
