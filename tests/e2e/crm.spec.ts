import { test, expect } from '@playwright/test';
import { signUp, uniqueTestEmail } from './helpers';

// Navegação principal (item TEST-002). A partir da migração pra rotas reais (src/App.tsx: <Route
// path="/app/*"> com <Routes> aninhadas por módulo), cada item do menu lateral corresponde a uma
// URL própria (/app/crm, /app/companies, ...) — deep-link e F5 numa tela específica já funcionam
// (ver teste "recarrega .../app/crm..." abaixo). Antes dessa migração a navegação era só estado de
// aba em memória e /app/crm sempre caía no Dashboard; esse teste existia justamente pra documentar
// essa limitação, que não existe mais.
const TAB_ROUTES: Record<string, string> = {
  'Pipeline CRM': 'crm',
  'Empresas': 'companies',
  'Decisores': 'contacts',
  'Agenda': 'activities',
  'Analytics': 'analytics',
};

test.describe('Navegação principal', () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page, { email: uniqueTestEmail('nav') });
  });

  test('carrega o Painel Central (dashboard) como aba padrão após login', async ({ page }) => {
    await expect(page).toHaveURL(/\/app$/);
    await expect(page).toHaveTitle(/AtlasGR|Commercial Intelligence OS/);
  });

  for (const [tab, route] of Object.entries(TAB_ROUTES)) {
    test(`navega para "${tab}" pela barra lateral sem erros de console`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      page.on('pageerror', (err) => consoleErrors.push(err.message));

      await page.getByRole('button', { name: tab }).click();
      await expect(page).toHaveURL(new RegExp(`/app/${route}$`));
      // Espera o skeleton de carregamento (lazy-loaded module) sumir antes de checar erros.
      await expect(page.getByRole('button', { name: tab })).toBeVisible();
      await page.waitForLoadState('networkidle');

      expect(consoleErrors, `erros de console ao abrir "${tab}": ${consoleErrors.join('; ')}`).toEqual([]);
    });
  }

  test('recarrega .../app/crm diretamente (deep-link) sem cair no dashboard', async ({ page }) => {
    await page.getByRole('button', { name: 'Pipeline CRM' }).click();
    await expect(page).toHaveURL(/\/app\/crm$/);

    await page.reload();

    await expect(page).toHaveURL(/\/app\/crm$/);
    await expect(page.getByRole('button', { name: 'Pipeline CRM' })).toBeVisible();
    // Pipeline CRM Sales Cloud é o h2 fixo do CrmBoard — confirma que renderizou o módulo certo,
    // não o dashboard (fallback antigo antes da migração pra rotas).
    await expect(page.getByText(/Sales Cloud \(Pipeline CRM\)/)).toBeVisible();
  });

  test('botão Voltar do navegador retorna do CRM pro dashboard', async ({ page }) => {
    await page.getByRole('button', { name: 'Pipeline CRM' }).click();
    await expect(page).toHaveURL(/\/app\/crm$/);

    await page.goBack();

    await expect(page).toHaveURL(/\/app$/);
  });
});
