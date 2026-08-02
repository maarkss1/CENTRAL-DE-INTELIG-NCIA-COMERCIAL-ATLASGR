import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.PORT ?? '3000';

export default defineConfig({
  testDir: './tests/e2e',
  // Os specs de auth/leads criam usuários/organizações reais no banco de testes de integração —
  // rodar em série evita duas rotinas de signup/CRUD pisando uma na outra na mesma tabela.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // `npm run preview` (vite preview) servia só o SPA estático, sem `/api` — nenhum teste que
    // dependesse de login real podia funcionar. `start:e2e` sobe o servidor Express de verdade
    // (auth, Prisma/RLS, todas as rotas), igual ao que roda em produção.
    command: 'npm run start:e2e',
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      NODE_ENV: process.env.NODE_ENV ?? 'test',
      PORT,
    },
  },
});
