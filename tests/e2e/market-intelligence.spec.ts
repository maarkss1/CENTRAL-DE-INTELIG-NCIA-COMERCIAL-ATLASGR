import { test, expect } from '@playwright/test';
import { signUp, uniqueTestEmail, waitForAppReady } from './helpers';

// MI-007 (Sprint 04/Onda 16): o módulo Market Intelligence (/app/market-intelligence) dependia
// só de tests/unit/market-intelligence/*.test.ts (lógica de domínio pura, sem DOM) e do
// typecheck do CI (market-intelligence-ci.yml) -- zero teste tocava a rota de verdade. Uma
// mudança futura no formato do manifest.json gerado pelos workflows Python (ex.: renomear um
// campo) quebraria a UI silenciosamente sem nenhum teste automatizado pegando, nem o smoke test
// mais básico de "a página carrega sem erro".

test.describe('Market Intelligence — módulo de território', () => {
  test('abre o módulo, navega para Saúde dos Dados e mostra o status real de cada dataset', async ({ page }) => {
    await signUp(page, { email: uniqueTestEmail('mi-smoke') });
    await page.goto('/app/market-intelligence');
    await waitForAppReady(page);

    await expect(page.getByRole('heading', { name: /Onde a Atlas GR deve contratar o próximo vendedor/i })).toBeVisible();

    await page.getByRole('button', { name: 'Saúde dos Dados' }).click();
    await expect(page.getByRole('heading', { name: /Competência, cobertura e confiança antes do score/i })).toBeVisible();

    // Não fixamos nomes/contagens exatas de dataset (o manifest real é atualizado por pipeline
    // automatizado, ver MI-001/MI-005) -- só que pelo menos um card de dataset renderizou com um
    // dos 4 status possíveis do contrato (DatasetHealth['status']), provando que o fetch real do
    // manifest.json chegou até a UI e foi parseado sem quebrar.
    const statusBadge = page.getByText(/^(ATUALIZADO|PARCIAL|DESATUALIZADO|NAO DISPONIVEL)$/).first();
    await expect(statusBadge).toBeVisible();
  });

  test('mostra board bloqueado por governança quando a decisão ainda não está pronta', async ({ page }) => {
    // Estado real e honesto do manifest hoje (ver public/tools/atlas-market-intelligence/data/
    // manifest.json, decisionReady: false) -- este teste também serve de sentinela: se algum dia
    // o pipeline avançar o suficiente para decisionReady virar true, este teste vai falhar de
    // forma óbvia e apontar exatamente para o board "pronto" precisar de um teste novo, em vez de
    // continuar testando um estado que não existe mais silenciosamente.
    await signUp(page, { email: uniqueTestEmail('mi-blocked') });
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
