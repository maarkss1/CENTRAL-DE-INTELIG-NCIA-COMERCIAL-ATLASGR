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
// O dashboard também tem a saudação por horário do dia e a data de hoje (greeting()/todayLabel em
// SinglePageDashboard.tsx — "Bom dia"/"Boa tarde"/"Boa noite" e a data por extenso, cada
// combinação com largura de texto diferente da baseline capturada num dia/hora diferentes) e o
// ClockCalendarWidget (relógio ao vivo com segundos, dia/data por extenso, e destaque de "hoje" —
// uma célula inteira do calendário — que muda de posição conforme o dia do mês em que a baseline
// foi capturada vs. o dia em que o CI roda). Isso era a causa de diffs intermitentes de milhares
// de pixels em runs sem nenhuma mudança real na tela (ex.: 3054px num commit só de docs).
// Mascarado via data-testid (blocos puramente informativos, não afetam o layout dos elementos
// vizinhos) em vez de só alargar o orçamento de diff pra essa tela inteira, que continua no mesmo
// padrão das outras (600).
//
// Achado real (onda 43): mesmo com os dois acima mascarados, o card "Leads Ganhos por Mês"
// (GlowChart.tsx, `<Area animationDuration={2000}>` do Recharts) ainda causava dezenas de milhares
// de pixels de diff — a animação de entrada do gráfico (interna ao Recharts/react-smooth, não é
// CSS, então `disableAnimations` do Playwright não a alcança) fica ~2s desenhando o path da área,
// e o "captured a stable screenshot" do Playwright trava num frame qualquer dessa animação,
// diferente a cada execução. Mesmo tratamento: mascarado via data-testid em vez de tentar
// sincronizar com o fim da animação.
//
// Achado real (merge com origin/main, 2026-09-02): o relógio HH:MM do AppTopbar (visível em toda
// tela autenticada, não só o dashboard) nunca tinha sido mascarado — só mudava 1-2 dígitos entre a
// geração do baseline e a verificação em CI (minutos de diferença), pequeno o bastante pra caber
// no orçamento de 600px por acidente. Ficou visível quando o baseline passou a ser gerado num job
// `workflow_dispatch` separado do job que roda a suíte (minutos de defasagem real), estourando o
// orçamento e marcando `dashboard-dark` como flaky. Mascarado via `app-topbar-clock`, aplicado
// também ao `crm-board` pelo mesmo motivo (mesmo AppTopbar).
const DASHBOARD_SCREENSHOT_OPTIONS = { fullPage: true, maxDiffPixels: 600 };

async function setTheme(page: import('@playwright/test').Page, theme: 'light' | 'dark') {
  await page.addInitScript((t) => {
    window.localStorage.setItem('atlas_theme', t);
  }, theme);
}

// Baselines *-chromium-linux.png geradas dentro do CI (job `visual-baselines`,
// workflow_dispatch em ci.yml, run 32521483569) e commitadas ao lado das *-chromium-win32.png já
// existentes — ver .agents/handoffs/onda-6/14-para-08-baselines-visuais-linux.md.
test.describe('Regressão visual', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`Painel Central (dashboard) — ${theme}`, async ({ page }) => {
      await setTheme(page, theme);
      await signUp(page, { email: uniqueTestEmail(`visual-dash-${theme}`) });
      await waitForAppReady(page);
      await expect(page).toHaveScreenshot(`dashboard-${theme}.png`, {
        ...DASHBOARD_SCREENSHOT_OPTIONS,
        mask: [
          page.getByTestId('dashboard-greeting'),
          page.getByTestId('clock-calendar-widget'),
          page.getByTestId('dashboard-analytics-chart'),
          page.getByTestId('app-topbar-clock'),
        ],
      });
    });

    test(`Pipeline CRM — ${theme}`, async ({ page }) => {
      await setTheme(page, theme);
      await signUp(page, { email: uniqueTestEmail(`visual-crm-${theme}`) });
      await page.getByRole('button', { name: 'Pipeline CRM' }).click();
      await waitForAppReady(page);
      await expect(page).toHaveScreenshot(`crm-board-${theme}.png`, {
        ...SCREENSHOT_OPTIONS,
        mask: [page.getByTestId('app-topbar-clock')],
      });
    });
  }

  test('Formulário de novo contato aberto — light', async ({ page }) => {
    await setTheme(page, 'light');
    await signUp(page, { email: uniqueTestEmail('visual-contact-form') });
    await page.getByRole('button', { name: 'Decisores' }).click();
    await waitForAppReady(page);
    await page
      .getByRole('button', { name: /Novo Contato|Adicionar Primeiro Contato/ })
      .first()
      .click();
    await expect(page.getByRole('heading', { name: 'Novo Contato', exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot('contact-form-light.png', { maxDiffPixels: 200 });
  });
});
