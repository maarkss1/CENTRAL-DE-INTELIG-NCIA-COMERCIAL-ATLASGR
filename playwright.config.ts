import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.PORT ?? '3000';

// Ambientes que já vêm com um Chromium provisionado (sandbox de agente, imagem corporativa de CI)
// costumam ter uma build diferente da que o @playwright/test instalado espera — o launch falha com
// "Executable doesn't exist at .../chromium_headless_shell-<build>/...", mesmo havendo um Chromium
// perfeitamente utilizável na máquina. Apontar o executável por env resolve isso sem tocar no
// caminho padrão: quando a variável não está definida, o Playwright continua resolvendo o browser
// sozinho, exatamente como o CI faz depois de `npx playwright install --with-deps chromium`.
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?.trim() || undefined;

export default defineConfig({
  testDir: './tests/e2e',
  // Os specs de auth/leads criam usuários/organizações reais no banco de testes de integração —
  // rodar em série evita duas rotinas de signup/CRUD pisando uma na outra na mesma tabela.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  // Default do Playwright (30s) não sobra folga pro signUp() de helpers.ts (que já usa até 30s
  // pra navegar pro app sob carga do runner do CI) mais o resto de cada teste. 45s dá esse espaço
  // sem esconder um hang de verdade — signUp() estoura o timeout dele primeiro nesse caso.
  timeout: 45_000,
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(chromiumExecutablePath ? { launchOptions: { executablePath: chromiumExecutablePath } } : {}),
      },
    },
  ],
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
      // O apiLimiter genérico envolve /api/auth antes do authLimiter dedicado. A suíte E2E inteira
      // faz centenas de GETs de sessão + chamadas de API a partir do mesmo IP do runner e pode
      // ultrapassar o default de produção (600/15min), mesmo com AUTH_RATE_LIMIT_MAX elevado.
      // Isto vale SOMENTE para o processo de servidor criado pelo Playwright; produção continua
      // usando o limite configurado em env.ts/Render. Mantemos um teto finito para ainda detectar
      // loops explosivos em testes, mas sem transformar o tamanho da suíte em falso 429.
      API_RATE_LIMIT_MAX: process.env.API_RATE_LIMIT_MAX ?? '5000',
      AUTH_RATE_LIMIT_MAX: process.env.AUTH_RATE_LIMIT_MAX ?? '500',
    },
  },
});
