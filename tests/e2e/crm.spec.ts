import { test, expect } from '@playwright/test';
import { signUp, uniqueTestEmail, waitForAppReady } from './helpers';

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
      await waitForAppReady(page);

      expect(consoleErrors, `erros de console ao abrir "${tab}": ${consoleErrors.join('; ')}`).toEqual([]);
    });
  }

  test('recarrega .../app/crm diretamente (deep-link) sem cair no dashboard', async ({ page }) => {
    await page.getByRole('button', { name: 'Pipeline CRM' }).click();
    await expect(page).toHaveURL(/\/app\/crm$/);

    await page.reload();

    await expect(page).toHaveURL(/\/app\/crm$/);
    await expect(page.getByRole('button', { name: 'Pipeline CRM' })).toBeVisible();
    // O h2 fixo do CrmBoard (src/components/CrmBoard.tsx) varia com o funil — "Leads e pré-vendas"
    // por padrão (funnel='Lead', o default ao navegar por /app/crm sem prop) ou "Negócios e
    // fechamento" — nunca "Sales Cloud (Pipeline CRM)", texto que este teste checava e que não
    // existe em nenhum lugar do componente. Confirma que renderizou o módulo certo (não o
    // dashboard, fallback antigo antes da migração pra rotas), com timeout maior que o default
    // (5s): diferente da navegação por clique (SPA, já carregada), um reload é um cold start duplo
    // — refaz o fetch da sessão (ProtectedRoute) E o carregamento do chunk lazy do CrmBoard — que
    // em runner de CI compartilhado pode passar de 5s sem que nada esteja realmente quebrado.
    await expect(page.getByText(/Leads e pré-vendas|Negócios e fechamento/)).toBeVisible({ timeout: 15_000 });
  });

  test('botão Voltar do navegador retorna do CRM pro dashboard', async ({ page }) => {
    await page.getByRole('button', { name: 'Pipeline CRM' }).click();
    await expect(page).toHaveURL(/\/app\/crm$/);

    await page.goBack();

    await expect(page).toHaveURL(/\/app$/);
  });
});
