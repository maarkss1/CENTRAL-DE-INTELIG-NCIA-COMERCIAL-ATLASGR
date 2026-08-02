import { test, expect } from '@playwright/test';
import { signUp, uniqueTestEmail } from './helpers';

// Navegação principal (item TEST-002). Importante: `/app/*` é uma rota "coringa" única
// (src/App.tsx) — a troca de módulo (Dashboard, CRM, Empresas, ...) acontece por estado de aba
// dentro de AppLayout (Sidebar.tsx: <button onClick={() => onTabChange(tool.id)}>), não por URL.
// Navegar direto para `/app/crm` sempre renderiza o Dashboard (aba padrão); por isso os testes
// abaixo clicam nos itens do menu lateral em vez de tentar acessar sub-rotas que não existem.
test.describe('Navegação principal', () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page, { email: uniqueTestEmail('nav') });
  });

  test('carrega o Painel Central (dashboard) como aba padrão após login', async ({ page }) => {
    await expect(page).toHaveURL(/\/app/);
    await expect(page).toHaveTitle(/AtlasGR|Commercial Intelligence OS/);
  });

  for (const tab of ['Pipeline CRM', 'Empresas', 'Decisores', 'Agenda', 'Analytics'] as const) {
    test(`navega para "${tab}" pela barra lateral sem erros de console`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      page.on('pageerror', (err) => consoleErrors.push(err.message));

      await page.getByRole('button', { name: tab }).click();
      // Espera o skeleton de carregamento (lazy-loaded module) sumir antes de checar erros.
      await expect(page.getByRole('button', { name: tab })).toBeVisible();
      await page.waitForLoadState('networkidle');

      expect(consoleErrors, `erros de console ao abrir "${tab}": ${consoleErrors.join('; ')}`).toEqual([]);
    });
  }
});
