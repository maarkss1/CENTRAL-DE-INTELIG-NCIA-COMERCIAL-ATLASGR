import { test, expect } from '@playwright/test';
import { signUp, uniqueTestEmail, waitForAppReady } from './helpers';

// Regressão visual das telas-chave, light e dark. Primeira execução (`npx playwright test
// tests/e2e/visual.spec.ts --update-snapshots`) gera os PNGs de baseline em
// tests/e2e/visual.spec.ts-snapshots/ — commitar essa pasta como referência. Execuções seguintes
// comparam pixel a pixel e falham se algo mudar visualmente sem querer.
//
// maxDiffPixels dá folga pro relógio ao vivo (ClockCalendarWidget, atualiza a cada segundo) e pra
// jitter normal de anti-aliasing/fontes entre execuções — sem isso a screenshot nunca estabiliza
// (o segundo do relógio muda enquanto o Playwright tira a foto de novo pra comparar consigo mesma).
const SCREENSHOT_OPTIONS = { fullPage: true, maxDiffPixels: 600 };
// O dashboard também tem a saudação por horário do dia (greeting() em SinglePageDashboard.tsx —
// "Bom dia"/"Boa tarde"/"Boa noite", cada uma com largura de texto diferente) e KPIs que variam
// entre a hora em que a baseline foi capturada e a hora da comparação — folga maior, específica
// pra essa tela, em vez de mascarar uma regressão real nas outras.
const DASHBOARD_SCREENSHOT_OPTIONS = { fullPage: true, maxDiffPixels: 2500 };

async function setTheme(page: import('@playwright/test').Page, theme: 'light' | 'dark') {
  await page.addInitScript((t) => {
    window.localStorage.setItem('atlas_theme', t);
  }, theme);
}

// SKIP temporário: as únicas baselines commitadas em tests/e2e/visual.spec.ts-snapshots/ são
// *-chromium-win32.png (geradas localmente no Windows). Playwright inclui a plataforma no nome do
// arquivo de baseline, então o CI (ubuntu-latest) sempre procura *-chromium-linux.png, que nunca
// existiu — todo teste deste arquivo falha com "A snapshot doesn't exist", não porque a tela mudou.
// Gerar localmente (mesmo em Linux, com Docker/Postgres de pé) NÃO resolve: o build exato do
// Chromium usado aqui (`chromium-1194`, provisionado no ambiente do agente) difere do que
// `npx playwright install --with-deps chromium` instala no runner `ubuntu-latest` do CI
// (`chromium_headless_shell-1228` na verificação de 2026-08-15) — anti-aliasing/rasterização de
// fonte variam entre builds o suficiente para criar falso positivo/negativo de regressão visual.
// Precisa ser gerado DENTRO do CI: rodar
// `npx playwright test tests/e2e/visual.spec.ts --update-snapshots` num job do `ci.yml` (ubuntu-latest,
// o mesmo runner/imagem que roda o `test:e2e` normal) e commitar os PNGs *-chromium-linux.png
// resultantes. Handoff aberto em .agents/handoffs/onda-6/14-para-08-baselines-visuais-linux.md.
test.describe.skip('Regressão visual', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`Painel Central (dashboard) — ${theme}`, async ({ page }) => {
      await setTheme(page, theme);
      await signUp(page, { email: uniqueTestEmail(`visual-dash-${theme}`) });
      await waitForAppReady(page);
      await expect(page).toHaveScreenshot(`dashboard-${theme}.png`, DASHBOARD_SCREENSHOT_OPTIONS);
    });

    test(`Pipeline CRM — ${theme}`, async ({ page }) => {
      await setTheme(page, theme);
      await signUp(page, { email: uniqueTestEmail(`visual-crm-${theme}`) });
      await page.getByRole('button', { name: 'Pipeline CRM' }).click();
      await waitForAppReady(page);
      await expect(page).toHaveScreenshot(`crm-board-${theme}.png`, SCREENSHOT_OPTIONS);
    });
  }

  test('Formulário de novo contato aberto — light', async ({ page }) => {
    await setTheme(page, 'light');
    await signUp(page, { email: uniqueTestEmail('visual-contact-form') });
    await page.getByRole('button', { name: 'Decisores' }).click();
    await waitForAppReady(page);
    await page.getByRole('button', { name: /Novo Contato|Adicionar Primeiro Contato/ }).first().click();
    await expect(page.getByRole('heading', { name: 'Novo Contato', exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot('contact-form-light.png', { maxDiffPixels: 200 });
  });
});
