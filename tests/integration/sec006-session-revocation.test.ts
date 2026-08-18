import { describe, it, expect, afterAll } from 'vitest';
import { auth } from '../../src/lib/auth';
import { prisma } from '../../src/lib/prisma';
import { requestContext } from '../../src/lib/async-context';
import { withRlsBypass, uniqueEmail } from '../helpers/rbac-e2e-helpers';

// SEC-006 (Sprint 01/Onda 13): prova, contra o Better Auth real (não um mock), que trocar a senha
// autenticado invalida sessões em OUTROS dispositivos/navegadores quando `revokeOtherSessions:
// true` é passado (ver src/features/auth/components/ChangePasswordGate.tsx) — antes desta sprint,
// nenhuma sessão era revogada na troca de senha (nem no fluxo autenticado, nem no reset por
// e-mail), então uma sessão comprometida sobrevivia à troca de senha até expirar naturalmente
// (7 dias).

const TEST_PASSWORD = 'ChangePasswordTest123!';
const NEW_PASSWORD = 'ChangePasswordTestNEW456!';

function cookieFromHeaders(headers: Headers): string {
  const raw: string[] = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : (headers.get('set-cookie') ? [headers.get('set-cookie') as string] : []);
  if (raw.length === 0) throw new Error('Nenhum Set-Cookie retornado.');
  return raw.map((c) => c.split(';')[0]).join('; ');
}

async function getSessionUserId(cookie: string): Promise<string | null> {
  const session = await requestContext.run({ bypassRls: true }, () =>
    auth.api.getSession({ headers: new Headers({ cookie }) })
  );
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

describe('SEC-006 — revogação de sessão ao trocar senha autenticado', () => {
  const createdUserIds: string[] = [];
  const createdOrgIds: string[] = [];

  afterAll(async () => {
    await withRlsBypass(async () => {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: createdOrgIds } } });
    });
  });

  it('changePassword com revokeOtherSessions:true derruba TODAS as sessões antigas (inclusive a que fez a troca) e emite uma sessão nova válida', async () => {
    // Comportamento real do Better Auth (node_modules/better-auth/dist/api/routes/update-user.mjs):
    // `revokeOtherSessions: true` não poupa a sessão chamadora — ele apaga TODAS as sessões do
    // usuário e cria uma sessão nova, devolvendo o cookie dela na resposta. O nome do parâmetro é
    // enganoso (sugere "as outras", mas a implementação derruba todas e reemite uma). O que importa
    // para SEC-006 é o resultado de segurança: nenhuma sessão anterior — nem a de outro
    // dispositivo, nem a antiga do próprio dispositivo que trocou a senha — sobrevive à troca.
    const email = uniqueEmail('sec006-session-revocation');

    // Sessão 1: signup real (primeiro login do usuário).
    const { headers: signUpHeaders, response: signUpResponse } = await withRlsBypass(() =>
      auth.api.signUpEmail({
        body: { email, password: TEST_PASSWORD, name: 'SEC-006 Test User' },
        returnHeaders: true,
      })
    ) as { headers: Headers; response: { user: { id: string; organizationId: string } } };

    createdUserIds.push(signUpResponse.user.id);
    createdOrgIds.push(signUpResponse.user.organizationId);
    const session1Cookie = cookieFromHeaders(signUpHeaders);

    // Sessão 2: login real num "outro dispositivo" (mesma conta, cookie diferente).
    const { headers: signInHeaders } = await withRlsBypass(() =>
      auth.api.signInEmail({
        body: { email, password: TEST_PASSWORD },
        returnHeaders: true,
      })
    ) as unknown as { headers: Headers };
    const session2Cookie = cookieFromHeaders(signInHeaders);

    // Confirma que as duas sessões funcionam ANTES da troca de senha.
    expect(await getSessionUserId(session1Cookie)).toBe(signUpResponse.user.id);
    expect(await getSessionUserId(session2Cookie)).toBe(signUpResponse.user.id);

    // Troca a senha USANDO a sessão 1, pedindo para revogar as demais.
    const { headers: changePasswordHeaders } = await withRlsBypass(() =>
      auth.api.changePassword({
        headers: new Headers({ cookie: session1Cookie }),
        body: { currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD, revokeOtherSessions: true },
        returnHeaders: true,
      })
    ) as unknown as { headers: Headers };
    const newSessionCookie = cookieFromHeaders(changePasswordHeaders);

    // Sessão 2 (outro dispositivo) precisa estar morta agora.
    expect(await getSessionUserId(session2Cookie)).toBeNull();

    // O cookie ORIGINAL da sessão 1 (o que existia antes da troca) também não serve mais — foi
    // substituído, não reaproveitado.
    expect(await getSessionUserId(session1Cookie)).toBeNull();

    // A sessão NOVA emitida pela própria troca de senha funciona — quem trocou a senha não fica
    // deslogado, só recebe um token novo.
    expect(await getSessionUserId(newSessionCookie)).toBe(signUpResponse.user.id);
  }, 30_000);
});
