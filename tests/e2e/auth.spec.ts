import { test, expect } from '@playwright/test';
import { signUp, uniqueTestEmail, E2E_PASSWORD } from './helpers';

// Cobre o critério de aceite do item 3 do backlog de dívida técnica (09-BACKLOG-EXECUTAVEL.md):
// "login só sucede com senha correta validada pelo servidor" — e o pedido explícito do plano de
// testes (07-PLANO-DE-TESTES.md) de tratar a correção de SEC-001/002/003 como test-first: estes
// specs batem contra o servidor Express real (auth.ts / better-auth), nunca contra um mock.
test.describe('Autenticação', () => {
  test('cadastro com e-mail corporativo autorizado cria a conta e entra no app', async ({ page }) => {
    await signUp(page, { email: uniqueTestEmail('signup') });
    await expect(page).toHaveURL(/\/app/);
  });

  test('e-mail fora dos domínios autorizados é rejeitado antes de chamar o servidor', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('E-mail:').fill('alguem@gmail.com');
    await page.getByPlaceholder('••••••••').fill(E2E_PASSWORD);
    await page.getByRole('button', { name: /Entrar na Plataforma/ }).click();
    await expect(page.getByText(/Acesso restrito/)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('login com senha correta autentica de verdade contra o servidor', async ({ page, context }) => {
    const email = uniqueTestEmail('login-ok');
    await signUp(page, { email });

    // Sessão nova, sem os cookies do signup, pra forçar um login real do zero.
    await context.clearCookies();
    await page.goto('/login');
    await page.getByLabel('E-mail:').fill(email);
    await page.getByPlaceholder('••••••••').fill(E2E_PASSWORD);
    await page.getByRole('button', { name: /Entrar na Plataforma/ }).click();
    await expect(page).toHaveURL(/\/app/, { timeout: 15_000 });
  });

  test('login com senha incorreta é rejeitado pelo servidor e não navega pro app', async ({ page, context }) => {
    const email = uniqueTestEmail('login-fail');
    await signUp(page, { email });

    await context.clearCookies();
    await page.goto('/login');
    await page.getByLabel('E-mail:').fill(email);
    await page.getByPlaceholder('••••••••').fill('SenhaErradaDeProposito!');
    await page.getByRole('button', { name: /Entrar na Plataforma/ }).click();

    // LoginScreen só renderiza um único <p> dentro do <form>: a mensagem de erro devolvida pelo
    // servidor (result.error.message do better-auth) quando a autenticação falha.
    await expect(page.locator('form p')).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('button', { name: /Entrar na Plataforma/ })).toBeVisible();
  });

  test('acessar /app sem sessão válida redireciona para /login (ProtectedRoute)', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/app');
    await expect(page).toHaveURL(/\/login/);
  });
});
