import { expect, test } from '@playwright/test';
import { signUp, uniqueTestEmail, waitForAppReady } from './helpers';

const MOBILE_VIEWPORT = { width: 393, height: 851 };

const MODULES = [
  'crm360',
  'mesa-tratamento',
  'propostas',
  'cadence',
  'roleplay',
  'qualification_matrix',
  'objections_matrix',
  'chatbook',
  'intelligence',
  'topic_training',
  'bitrix',
  'reports',
  'integrations',
  'knowledge',
  'winloss',
  'calendar',
  'notifications',
  'automations',
  'usage',
  'editor',
  'team',
  'prospect',
  'dashboard',
  'crm',
  'contacts',
  'companies',
  'activities',
  'analytics',
  'settings',
] as const;

interface ModuleFailure {
  module: string;
  reason: string;
}

test.describe('Onda 4 mobile sweep', () => {
  test.use({
    viewport: MOBILE_VIEWPORT,
    isMobile: true,
    hasTouch: true,
  });

  test('todos os módulos navegáveis ficam utilizáveis sem overflow horizontal ou tela branca', async ({ page }) => {
    test.setTimeout(180_000);

    await signUp(page, {
      email: uniqueTestEmail('mobile-sweep'),
      name: `E2E Mobile Sweep ${Date.now()}`,
    });

    const failures: ModuleFailure[] = [];

    for (const module of MODULES) {
      await test.step(`/app/${module}`, async () => {
        try {
          await page.goto(`/app/${module}`, {
            waitUntil: 'domcontentloaded',
            timeout: 20_000,
          });
          await waitForAppReady(page);

          // Dá um pequeno intervalo para componentes que calculam layout após o primeiro paint.
          await page.waitForTimeout(150);

          const dimensions = await page.evaluate(() => {
            const documentElement = document.documentElement;
            const body = document.body;
            return {
              clientWidth: documentElement.clientWidth,
              scrollWidth: Math.max(documentElement.scrollWidth, body.scrollWidth),
            };
          });
          const overflowPx = dimensions.scrollWidth - dimensions.clientWidth;

          if (overflowPx > 4) {
            failures.push({
              module,
              reason: `overflow horizontal de ${overflowPx}px (viewport=${dimensions.clientWidth}px, conteúdo=${dimensions.scrollWidth}px)`,
            });
          }

          const bodyText = await page.locator('body').innerText().catch(() => '');
          if (bodyText.trim().length < 20) {
            failures.push({ module, reason: 'conteúdo visível insuficiente; possível tela branca' });
          }
        } catch (error) {
          failures.push({
            module,
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      });
    }

    expect(
      failures,
      failures.map(({ module, reason }) => `/app/${module}: ${reason}`).join('\n'),
    ).toEqual([]);
  });
});
