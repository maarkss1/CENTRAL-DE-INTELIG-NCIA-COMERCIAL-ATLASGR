import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { signUp, uniqueTestEmail, waitForAppReady } from './helpers';

// Varredura automática de acessibilidade (axe-core) nas telas principais. Não bloqueia em toda e
// qualquer violação — o app tem um backlog conhecido de achados `moderate`/`minor` (ver
// eslint.config.mjs e DESIGN_QA_CENTRAL_ATLASGR.md, ex.: jsx-a11y/label-has-associated-control em
// vários formulários) que ainda não foi corrigido. Este teste falha só em `critical`/`serious`, que
// são os que realmente impedem uso por teclado/leitor de tela — o resto fica visível no relatório
// HTML do Playwright (`attachment`) para triagem incremental, sem travar o CI hoje.
const BLOCKING_IMPACTS = ['critical', 'serious'];

async function assertNoBlockingViolations(page: import('@playwright/test').Page, testInfo: import('@playwright/test').TestInfo) {
  const results = await new AxeBuilder({ page }).analyze();

  await testInfo.attach('axe-results', {
    body: JSON.stringify(results.violations, null, 2),
    contentType: 'application/json',
  });

  const blocking = results.violations.filter((v) => BLOCKING_IMPACTS.includes(v.impact ?? ''));
  const summary = blocking
    .map((v) => `[${v.impact}] ${v.id} — ${v.help} (${v.nodes.length} ocorrência(s))`)
    .join('\n');

  expect(blocking, summary).toEqual([]);
}

test.describe('Acessibilidade automática (axe-core)', () => {
  test('tela de login não tem violações críticas/sérias', async ({ page }, testInfo) => {
    await page.goto('/login');
    await assertNoBlockingViolations(page, testInfo);
  });

  test('Painel Central (dashboard) não tem violações críticas/sérias', async ({ page }, testInfo) => {
    await signUp(page, { email: uniqueTestEmail('a11y-dash') });
    await waitForAppReady(page);
    await assertNoBlockingViolations(page, testInfo);
  });

  test('Pipeline CRM não tem violações críticas/sérias', async ({ page }, testInfo) => {
    await signUp(page, { email: uniqueTestEmail('a11y-crm') });
    await page.getByRole('button', { name: 'Pipeline CRM' }).click();
    await waitForAppReady(page);
    await assertNoBlockingViolations(page, testInfo);
  });

  test('Configurações não tem violações críticas/sérias', async ({ page }, testInfo) => {
    await signUp(page, { email: uniqueTestEmail('a11y-settings') });
    // Deep-link direto (rota real desde a migração de tab-state pra react-router) — não depende do
    // item de menu, que só aparece pra usuários admin.
    await page.goto('/app/settings');
    await waitForAppReady(page);
    await assertNoBlockingViolations(page, testInfo);
  });

  test('Market Intelligence não tem violações críticas/sérias', async ({ page }, testInfo) => {
    // MI-007 (Sprint 04/Onda 16): rota aberta a qualquer usuário logado (sem RequireRole), nunca
    // coberta por este arquivo até agora — ver tests/e2e/market-intelligence.spec.ts para o smoke
    // test funcional da mesma rota.
    await signUp(page, { email: uniqueTestEmail('a11y-market-intel') });
    await page.goto('/app/market-intelligence');
    await waitForAppReady(page);
    await assertNoBlockingViolations(page, testInfo);
  });

  test('Cadência não tem violações críticas/sérias', async ({ page }, testInfo) => {
    // CYC-009 (onda 29): tela ganhou ações de escrita reais (pausar/retomar/parar) nesta rodada,
    // nunca coberta por este arquivo até agora.
    await signUp(page, { email: uniqueTestEmail('a11y-cadence') });
    await page.goto('/app/cadence');
    await waitForAppReady(page);
    await assertNoBlockingViolations(page, testInfo);
  });
});
