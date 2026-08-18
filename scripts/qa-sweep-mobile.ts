import { chromium, devices } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';
const PASSWORD = 'E2eTestPassword123!';
const email = `qa-fase4-mobile-${Date.now()}@atlasgr.com.br`;

const MODULES = [
  'crm360', 'mesa-tratamento', 'propostas', 'cadence', 'roleplay',
  'qualification_matrix', 'objections_matrix', 'chatbook', 'intelligence',
  'market-intelligence', 'topic_training', 'bitrix', 'reports', 'integrations',
  'knowledge', 'winloss', 'calendar', 'notifications', 'automations', 'usage',
  'editor', 'team', 'prospect', 'dashboard', 'crm', 'contacts', 'companies',
  'activities', 'analytics', 'settings',
];

async function main() {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const context = await browser.newContext({ ...devices['Pixel 5'] });
  const page = await context.newPage();

  await page.addInitScript(() => {
    window.localStorage.setItem('@prospector:has_seen_tour', 'true');
  });

  await page.goto(`${BASE_URL}/login`);
  await page.getByText('Não possui conta? Registrar Novo Acesso').click();
  await page.getByPlaceholder('Ex: Marcelo Nascimento').fill('QA Fase 4 Mobile');
  await page.getByPlaceholder('seu.nome@atlasgr.com.br ou @totaltrac.com.br').fill(email);
  await page.getByPlaceholder('••••••••').fill(PASSWORD);
  await page.getByRole('button', { name: /Criar Nova Conta/ }).click();
  await page.waitForURL('**/app*', { timeout: 30_000 });
  console.log(`LOGIN OK (mobile, Pixel 5 393x851): ${email}`);

  const results: Array<{ module: string; status: string; detail: string }> = [];

  for (const mod of MODULES) {
    try {
      await page.goto(`${BASE_URL}/app/${mod}`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
      await page.waitForSelector('[data-testid="page-fallback"]', { state: 'detached', timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(700);

      // Overflow horizontal real: scrollWidth do documentElement/body maior que a viewport.
      const overflow = await page.evaluate(() => {
        const docEl = document.documentElement;
        const body = document.body;
        return {
          docScrollWidth: docEl.scrollWidth,
          bodyScrollWidth: body.scrollWidth,
          clientWidth: docEl.clientWidth,
        };
      });
      const overflowPx = Math.max(overflow.docScrollWidth, overflow.bodyScrollWidth) - overflow.clientWidth;

      const bodyText = await page.locator('body').innerText().catch(() => '');
      const isBlank = bodyText.trim().length < 20;

      await page.screenshot({ path: `/tmp/qa-fase4-mobile-${mod}.png` }).catch(() => {});

      results.push({
        module: mod,
        status: isBlank ? 'BLANK' : overflowPx > 4 ? `OVERFLOW_${overflowPx}px` : 'OK',
        detail: `clientWidth=${overflow.clientWidth} scrollWidth=${Math.max(overflow.docScrollWidth, overflow.bodyScrollWidth)}`,
      });
    } catch (e) {
      results.push({ module: mod, status: 'EXCEPTION', detail: String(e).slice(0, 200) });
    }
  }

  console.log('\n=== RESULTADOS MOBILE (Pixel 5, 393x851) ===');
  for (const r of results) {
    console.log(`${r.status.padEnd(18)} /app/${r.module.padEnd(22)} ${r.detail}`);
  }

  await browser.close();
}

main().catch((e) => {
  console.error('FALHA NO SCRIPT:', e);
  process.exit(1);
});
