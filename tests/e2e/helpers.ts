import type { Page } from '@playwright/test';
import { prisma } from '../../src/lib/prisma';
import { requestContext } from '../../src/lib/async-context';

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
  // 15s bastava numa suíte E2E curta, mas com dezenas de specs rodando em série (workers: 1) contra
  // o mesmo servidor/Postgres de teste, o signup (POST /api/auth/sign-up/email + refetch de sessão,
  // ver LoginScreen.tsx) ocasionalmente passa de 15s sob a carga do runner do CI — sem indício de
  // travamento real (não achamos nenhuma mudança recente no fluxo de signup/RLS que explique um
  // hang). 30s dá folga sem mascarar um hang de verdade (o timeout global do teste, abaixo, seria
  // estourado de qualquer forma nesse caso).
  await page.waitForURL('**/app*', { timeout: 30_000 });
}

/**
 * Rebaixa/eleva o papel de um usuário já cadastrado, direto no banco de teste — usado só por
 * specs de RBAC que precisam de um papel diferente de ADMIN (o público `signUp()` sempre cria um
 * ADMIN, porque é sempre o primeiro usuário de uma Organization nova; não existe fluxo de
 * signup público para GESTOR/VENDEDOR/VISUALIZADOR, esses papéis só existem via convite de um
 * ADMIN — ver `src/features/team`). Mesmo padrão de bypass de RLS usado em
 * `tests/helpers/rbac-e2e-helpers.ts` para os testes de integração equivalentes.
 */
export async function setUserRole(email: string, role: 'ADMIN' | 'GESTOR' | 'VENDEDOR' | 'VISUALIZADOR'): Promise<void> {
  // `enterWith` (não `.run()`) de propósito — mesmo racional de `tests/helpers/rbac-e2e-helpers.ts`:
  // `prisma.user.update(...)` devolve um `PrismaPromise` preguiçoso (só dispara a query real ao
  // ser `await`ado), e o hook `$allOperations` da extensão (src/lib/prisma.ts) que lê
  // `requestContext.getStore()` roda nesse momento posterior — depois que um `.run(store, cb)`
  // síncrono já teria retornado. `enterWith` muta o contexto ambiente do resto da execução em vez
  // de escopar a um callback, e por isso sobrevive até a query de fato disparar.
  requestContext.enterWith({ bypassRls: true });
  await prisma.user.update({ where: { email }, data: { role } });
}
