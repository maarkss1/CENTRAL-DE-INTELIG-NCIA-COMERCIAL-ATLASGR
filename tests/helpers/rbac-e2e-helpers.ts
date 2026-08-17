import { prisma } from '../../src/lib/prisma';
import { requestContext } from '../../src/lib/async-context';
import { auth } from '../../src/lib/auth';

// Extraído de tests/integration/rbac-e2e.test.ts (TEST-006) para reuso por outros specs de RBAC
// ponta-a-ponta (ver tests/integration/rbac-e2e-crm-operations.test.ts) sem duplicar a lógica de
// sessão real / bypass de RLS. Ver o comentário original em rbac-e2e.test.ts para o raciocínio
// completo de por que `enterWith` (não `.run()`) e por que signup+promoção de role compartilham o
// mesmo bloco `withRlsBypass`.
export const DEFAULT_TENANT_ID = 'test-org-id';

export async function withRlsBypass<T>(fn: () => Promise<T>): Promise<T> {
  requestContext.enterWith({ bypassRls: true });
  try {
    return await fn();
  } finally {
    requestContext.enterWith({ tenantId: DEFAULT_TENANT_ID });
  }
}

export async function withTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  requestContext.enterWith({ tenantId });
  try {
    return await fn();
  } finally {
    requestContext.enterWith({ tenantId: DEFAULT_TENANT_ID });
  }
}

const TEST_PASSWORD = 'RbacTestPassword123!';

// Domínio @atlasgr.com.br: único jeito de passar por isAuthorizedLoginEmail
// (src/config/access-policy.ts), checado tanto pelo databaseHooks.user.create.before do
// better-auth (src/lib/auth.ts) quanto por databaseHooks.session.create.before.
export function uniqueEmail(prefix: string): string {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  return `rbac-${prefix}-${unique}@atlasgr.com.br`;
}

export interface RealSessionUser {
  userId: string;
  organizationId: string;
  /** Header `Cookie` pronto pra usar em supertest — cookie de sessão REAL, assinado pelo better-auth. */
  cookie: string;
}

/**
 * Cria um usuário real via `auth.api.signUpEmail` e devolve o cookie de sessão REAL emitido pelo
 * better-auth. Ver o comentário completo em tests/integration/rbac-e2e.test.ts (mesma função,
 * extraída aqui sem mudança de comportamento).
 */
export async function signUpRealUser(prefix: string, role: 'ADMIN' | 'GESTOR' | 'CLOSER' | 'SDR' | 'VISUALIZADOR'): Promise<RealSessionUser> {
  const email = uniqueEmail(prefix);

  const { payload, headers } = await withRlsBypass(async () => {
    const { response, headers } = await auth.api.signUpEmail({
      body: { email, password: TEST_PASSWORD, name: `RBAC Test ${prefix}` },
      returnHeaders: true,
    }) as { response: { user: { id: string; organizationId: string; role: string } }; headers: Headers };

    if (response.user.role !== role) {
      await prisma.user.update({ where: { id: response.user.id }, data: { role } });
    }

    return { payload: response.user, headers };
  });

  const rawSetCookies: string[] = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : (headers.get('set-cookie') ? [headers.get('set-cookie') as string] : []);

  if (rawSetCookies.length === 0) {
    throw new Error(`signUpEmail não retornou Set-Cookie para ${email} — sem sessão real pra reaproveitar.`);
  }

  const cookie = rawSetCookies.map((raw) => raw.split(';')[0]).join('; ');
  const { id: userId, organizationId } = payload;

  return { userId, organizationId, cookie };
}
