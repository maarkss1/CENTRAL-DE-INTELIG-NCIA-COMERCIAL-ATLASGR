import { test, expect } from '@playwright/test';
import { signUp, uniqueTestEmail, waitForAppReady } from './helpers';

// MI-007 (Sprint 04/Onda 16): este E2E toca a rota real do Market Intelligence e funciona
// como contrato entre manifest, snapshots publicados e UI. A metodologia territorial continua
// fail-closed se uma camada obrigatória desaparecer, e a calibração econômica só aplica CRM por ação explícita.

test.describe('Market Intelligence — módulo de território', () => {
  test('abre o módulo, navega para Saúde dos Dados e mostra o status real de cada dataset', async ({ page }) => {
    await signUp(page, { email: uniqueTestEmail('mi-smoke') });
    await page.goto('/app/market-intelligence');
    await waitForAppReady(page);

    await expect(page.getByRole('heading', { name: /Onde a Atlas GR deve contratar o próximo vendedor/i })).toBeVisible();

    await page.getByRole('button', { name: 'Saúde dos Dados' }).click();
    await expect(page.getByRole('heading', { name: /Competência, cobertura e confiança antes do score/i })).toBeVisible();

    const statusBadge = page.getByText(/^(ATUALIZADO|PARCIAL|DESATUALIZADO|NAO DISPONIVEL)$/).first();
    await expect(statusBadge).toBeVisible();
  });

  test('mostra ranking territorial Core Evidence quando os snapshots obrigatórios estão publicados', async ({ page }) => {
    await signUp(page, { email: uniqueTestEmail('mi-ready') });
    await page.goto('/app/market-intelligence');
    await waitForAppReady(page);

    await expect(page.getByRole('heading', { name: /Top 5 territórios calculados/i })).toBeVisible();
    await expect(page.getByText(/^#1$/)).toBeVisible();
    await expect(page.getByText(/Score/i).first()).toBeVisible();
  });

  test('liga unit economics aos territorios reais sem inventar premissas', async ({ page }) => {
    await signUp(page, { email: uniqueTestEmail('mi-economics') });
    await page.goto('/app/market-intelligence');
    await waitForAppReady(page);

    await page.getByRole('button', { name: /Economia territorial/i }).click();
    await expect(page.getByRole('heading', { name: /O território paga a contratação/i })).toBeVisible();
    await expect(page.getByLabel('Território analisado')).toBeVisible();
    await expect(page.getByText('PREMISSAS PENDENTES').first()).toBeVisible();
    await expect(page.getByText('TAM ICP observado', { exact: true })).toBeVisible();
    await expect(page.getByText('SAM derivado', { exact: true })).toBeVisible();
  });

  test('calibra ticket, win rate e sales cycle com historico real somente após ação explícita', async ({ page }) => {
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

    await expect(page.getByText('CONFIANÇA ALTA', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Ticket MRR médio')).toHaveValue('0');
    await page.getByRole('button', { name: 'Aplicar dados do CRM' }).click();
    await expect(page.getByLabel('Ticket MRR médio')).toHaveValue('3000');
    await expect(page.getByLabel('Win Rate')).toHaveValue('25');
    await expect(page.getByLabel('Sales Cycle')).toHaveValue('40');
    await expect(page.getByText(/aplicado ao cenário atual/i)).toBeVisible();
  });

  test('volta a bloquear a decisão se o CIOT publicado desaparecer em runtime', async ({ page }) => {
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