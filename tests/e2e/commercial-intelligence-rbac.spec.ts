import { test, expect } from '@playwright/test';
import { signUp, uniqueTestEmail, setUserRole } from './helpers';

// Complementa a suíte de integração (tests/integration/rbac-e2e-commercial-intelligence.test.ts,
// que já cobre os 403/401 reais de API com sessão real) com a camada de UI: o item de menu
// só aparece para quem tem permissão, e acesso direto por URL mostra o bloqueio explícito em vez
// de uma tela quebrada ou (pior) o conteúdo restrito. Ver RequireRole (src/components/layout/
// RequireRole.tsx) e Sidebar.tsx.
test.describe('Comercial Inteligente — RBAC na UI', () => {
  test('ADMIN (primeiro usuário da organização) vê o item de menu e acessa o módulo', async ({ page }) => {
    await signUp(page, { email: uniqueTestEmail('ci-admin') });

    await expect(page.getByRole('button', { name: 'Comercial Inteligente' })).toBeVisible();

    await page.getByRole('button', { name: 'Comercial Inteligente' }).click();
    await expect(page).toHaveURL(/\/app\/commercial_intelligence/);
    await expect(page.getByRole('button', { name: 'Visão Executiva' })).toBeVisible();
  });

  test('SDR não vê o item de menu e acesso direto por URL mostra "Acesso restrito"', async ({ page }) => {
    const email = uniqueTestEmail('ci-vendedor');
    await signUp(page, { email });
    await setUserRole(email, 'SDR');

    // Recarrega para a sessão refletir o novo papel (o client do better-auth cacheia a sessão).
    await page.reload();
    await expect(page.getByRole('button', { name: 'Comercial Inteligente' })).toHaveCount(0);

    await page.goto('/app/commercial_intelligence');
    // "Acesso restrito" é o único conteúdo da área principal — o título "Comercial Inteligente" no
    // topbar aparece pra qualquer usuário autenticado (mesmo comportamento de qualquer outra rota,
    // ver Topbar), então o sinal real de bloqueio é a AUSÊNCIA da navegação por abas do módulo
    // (só existe dentro de CommercialIntelligenceHub, que RequireRole impede de montar).
    await expect(page.getByText('Acesso restrito')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Visão Executiva' })).toHaveCount(0);
  });

  test('VISUALIZADOR não vê o item de menu e acesso direto por URL mostra "Acesso restrito"', async ({ page }) => {
    const email = uniqueTestEmail('ci-viewer');
    await signUp(page, { email });
    await setUserRole(email, 'VISUALIZADOR');

    await page.reload();
    await expect(page.getByRole('button', { name: 'Comercial Inteligente' })).toHaveCount(0);

    await page.goto('/app/commercial_intelligence');
    await expect(page.getByText('Acesso restrito')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Visão Executiva' })).toHaveCount(0);
  });

  test('GESTOR vê o item de menu e acessa o módulo', async ({ page }) => {
    const email = uniqueTestEmail('ci-gestor');
    await signUp(page, { email });
    await setUserRole(email, 'GESTOR');

    await page.reload();
    await expect(page.getByRole('button', { name: 'Comercial Inteligente' })).toBeVisible();

    await page.goto('/app/commercial_intelligence');
    await expect(page.getByRole('button', { name: 'Visão Executiva' })).toBeVisible();
  });
});
