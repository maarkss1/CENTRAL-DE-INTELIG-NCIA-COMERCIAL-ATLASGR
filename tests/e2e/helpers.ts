import type { Page } from '@playwright/test';

// Sempre @atlasgr.com.br: só domínios autorizados (ver src/config/access-policy.ts) passam pela
// checagem client-side E pelo databaseHooks.user.create.before do better-auth (src/lib/auth.ts).
export function uniqueTestEmail(prefix: string): string {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  return `e2e-${prefix}-${unique}@atlasgr.com.br`;
}

export const E2E_PASSWORD = 'E2eTestPassword123!';

interface SignUpOptions {
  email: string;
  password?: string;
  name?: string;
}

// Cria um usuário real via o formulário de cadastro do LoginScreen (mesmo caminho que um usuário
// real percorre — sem atalho de API/seed) e espera a navegação pro app autenticado. O signup do
// better-auth já loga o usuário automaticamente, então isto deixa `page` com uma sessão válida.
export async function signUp(page: Page, { email, password = E2E_PASSWORD, name }: SignUpOptions) {
  // Organization.name é @unique (prisma/schema.prisma) e o hook de signup (src/lib/auth.ts) deriva
  // o nome da org a partir de `name` + marca — um default fixo tipo "E2E Test User" faz toda
  // segunda chamada de signUp() colidir na constraint única. Isso apareceu mascarado como uma
  // suposta violação de RLS, porque o catch de executeWithRls (src/lib/prisma.ts) reexecutava a
  // query sem contexto nenhum depois do erro real (P2002) — bug real corrigido separadamente.
  const resolvedName = name ?? `E2E Test User ${email}`;
  // OnboardingTour.tsx mostra um tour em overlay 1.5s depois do primeiro carregamento de /app pra
  // qualquer navegador sem essa chave no localStorage — em testes isso sempre é "sem", então o
  // overlay aparecia no meio do teste e bloqueava clique nos botões da sidebar (crm.spec.ts).
  // addInitScript roda antes de qualquer script da página em toda navegação futura.
  await page.addInitScript(() => {
    window.localStorage.setItem('@prospector:has_seen_tour', 'true');
  });
  await page.goto('/login');
  await page.getByText('Não possui conta? Registrar Novo Acesso').click();
  await page.getByPlaceholder('Ex: Marcelo Nascimento').fill(resolvedName);
  await page.getByPlaceholder('seu.nome@atlasgr.com.br ou @totaltrac.com.br').fill(email);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.getByRole('button', { name: /Criar Nova Conta/ }).click();
  await page.waitForURL('**/app*', { timeout: 15_000 });
}
