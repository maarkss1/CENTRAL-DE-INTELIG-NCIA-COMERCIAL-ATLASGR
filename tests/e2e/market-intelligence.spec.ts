import { test, expect } from '@playwright/test';
import { signUp, uniqueTestEmail, waitForAppReady } from './helpers';

// Contrato E2E da rota real de Market Intelligence.
// Core Evidence pode sustentar investigação e simulação econômica, mas a ordem final de
// contratação permanece fail-closed até concorrência, White Space, Hub Suitability e economics.

test.describe('Market Intelligence — módulo de território', () => {
  test('abre o módulo, navega para Saúde dos Dados e mostra o status real de cada dataset', async ({ page }) => {
    await signUp(page, { email: uniqueTestEmail('mi-smoke') });
    await page.goto('/app/market-intelligence');
    await waitForAppReady(page);

    await expect(page.getByRole('heading', { name: /Onde a Atlas GR deve contratar o próximo vendedor/i })).toBeVisible();

    await page.getByRole('button', { name: 'Saúde dos Dados' }).click();
    await expect(page.getByRole('heading', { name: /Competência, cobertura e confiança antes do score/i })).toBeVisible();
    await expect(page.getByText('Hub Suitability / eficiência da cidade-base', { exact: true })).toBeVisible();

    const statusBadge = page.getByText(/^(ATUALIZADO|PARCIAL|DESATUALIZADO|NAO DISPONIVEL)$/).first();
    await expect(statusBadge).toBeVisible();
  });

  test('bloqueia a contratação final e preserva candidatos Core Evidence para investigação', async ({ page }) => {
    await signUp(page, { email: uniqueTestEmail('mi-final-gate') });
    await page.goto('/app/market-intelligence');
    await waitForAppReady(page);

    await expect(page.getByRole('heading', { name: /Ainda não há evidência suficiente para nomear o vendedor 01/i })).toBeVisible();
    await expect(page.getByText(/censo nacional de concorrência/i).first()).toBeVisible();
    await expect(page.getByText(/Hub Suitability/i).first()).toBeVisible();

    await page.getByRole('button', { name: 'Territórios' }).click();
    await expect(page.getByRole('heading', { name: /Territórios calculados/i })).toBeVisible();
    await expect(page.getByText(/ALTO|MEDIO|BAIXO|BLOQUEADO/).first()).toBeVisible();
  });

  test('mantém unit economics utilizável sem transformar simulação em autorização de contratação', async ({ page }) => {
    await signUp(page, { email: uniqueTestEmail('mi-economics') });
    await page.goto('/app/market-intelligence');
    await waitForAppReady(page);

    await page.getByRole('button', { name: /Economia territorial/i }).click();
    await expect(page.getByRole('status', { name: /Simulação exploratória com decisão final bloqueada/i })).toBeVisible();
    await expect(page.getByText(/o resultado não autoriza a contratação/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: /O território paga a contratação/i })).toBeVisible();
    await expect(page.getByLabel('Território analisado')).toBeVisible();
    await expect(page.getByText('TAM ICP observado', { exact: true })).toBeVisible();
    await expect(page.getByText('SAM derivado', { exact: true })).toBeVisible();
    await expect(page.getByText('PREMISSAS PENDENTES').first()).toBeVisible();
  });

  test('calibra ticket, win rate e sales cycle com histórico real somente após ação explícita', async ({ page }) => {
    await page.route('**/api/commercial-intelligence/trends?**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          points: [
            { period: '2026-03', label: 'Mar', winRate: 25, salesCycleMeanDays: 40, averageTicketWon: 3000, pipelineCreatedAmount: 100000, closedSampleSize: 15 },
            { period: '2026-04', label: 'Abr', winRate: 25, salesCycleMeanDays: 40, averageTicketWon: 3000, pipelineCreatedAmount: 100000, closedSampleSize: 15 },
            { period: '2026-05', label: 'Mai', winRate: 25, salesCycleMeanDays: 40, averageTicketWon: 3000, pipelineCreatedAmount: 100000, closedSampleSize: 15 },
            { period: '2026-06', label: 'Jun', winRate: 25, salesCycleMeanDays: 40, averageTicketWon: 3000, pipelineCreatedAmount: 100000, closedSampleSize: 15 },
          ],
        },
      }),
    }));

    await signUp(page, { email: uniqueTestEmail('mi-crm-calibration') });
    await page.goto('/app/market-intelligence');
    await waitForAppReady(page);
    await page.getByRole('button', { name: /Economia territorial/i }).click();

    await expect(page.getByRole('heading', { name: /O território paga a contratação/i })).toBeVisible();
    await expect(page.getByText('CONFIANÇA ALTA', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Ticket MRR médio')).toHaveValue('0');
    await page.getByRole('button', { name: 'Aplicar dados do CRM' }).click();
    await expect(page.getByLabel('Ticket MRR médio')).toHaveValue('3000');
    await expect(page.getByLabel('Win Rate')).toHaveValue('25');
    await expect(page.getByLabel('Sales Cycle')).toHaveValue('40');
    await expect(page.getByText(/aplicado ao cenário atual/i)).toBeVisible();
  });

  test('continua fail-closed se o CIOT publicado desaparecer em runtime', async ({ page }) => {
    await page.route('**/tools/atlas-market-intelligence/data/mdfe_origens_municipios.json', (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }),
    );
    await page.route('**/tools/atlas-market-intelligence/data/mdfe_destinos_municipios.json', (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }),
    );

    await signUp(page, { email: uniqueTestEmail('mi-fail-closed') });
    await page.goto('/app/market-intelligence');
    await waitForAppReady(page);

    await expect(page.getByRole('heading', { name: /Ainda não há evidência suficiente para nomear o vendedor 01/i })).toBeVisible();
    await expect(page.getByText(/CIOT origem\/destino obrigatório/i)).toBeVisible();
  });

  test('valida responsividade real, ausência de overflow horizontal e captura evidências visuais', async ({ page }, testInfo) => {
    const viewports = [
      { name: 'desktop-1920x1080', width: 1920, height: 1080 },
      { name: 'desktop-1440x900', width: 1440, height: 900 },
      { name: 'desktop-1366x768', width: 1366, height: 768 },
      { name: 'tablet-820x1180', width: 820, height: 1180 },
      { name: 'mobile-390x844', width: 390, height: 844 },
    ];

    await page.setViewportSize({ width: viewports[0].width, height: viewports[0].height });
    await signUp(page, { email: uniqueTestEmail('mi-visual') });

    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/app/market-intelligence');
      await waitForAppReady(page);
      await expect(page.getByRole('heading', { name: /Onde a Atlas GR deve contratar o próximo vendedor/i })).toBeVisible();

      const overflow = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
        bodyWidth: document.body.scrollWidth,
      }));
      expect(overflow.documentWidth, `${viewport.name}: documentElement não pode criar overflow horizontal`).toBeLessThanOrEqual(overflow.viewportWidth + 1);
      expect(overflow.bodyWidth, `${viewport.name}: body não pode criar overflow horizontal`).toBeLessThanOrEqual(overflow.viewportWidth + 1);

      const screenshot = await page.screenshot({ fullPage: true });
      await testInfo.attach(`market-intelligence-${viewport.name}`, { body: screenshot, contentType: 'image/png' });
    }
  });

  test('mostra estado de erro quando o manifest não pode ser carregado', async ({ page }) => {
    await page.route('**/tools/atlas-market-intelligence/data/manifest.json', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
    );

    await signUp(page, { email: uniqueTestEmail('mi-error') });
    await page.goto('/app/market-intelligence');

    await expect(page.getByRole('alert')).toBeVisible();
  });
});
