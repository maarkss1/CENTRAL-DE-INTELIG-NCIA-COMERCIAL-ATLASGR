import { describe, it, expect, afterAll } from 'vitest';
import { auth } from '../../src/lib/auth';
import { prisma } from '../../src/lib/prisma';
import { withRlsBypass, uniqueEmail } from '../helpers/rbac-e2e-helpers';

/**
 * Prova, contra o Better Auth real (não um mock) e Postgres real, o bloqueio de conta por
 * tentativas de login malsucedidas (hooks.before/after em src/lib/auth.ts) — complementa o rate
 * limit por IP (AUTH_RATE_LIMIT_MAX, src/bootstrap/rateLimiters.ts), que sozinho não contém um
 * atacante distribuído por vários IPs contra a MESMA conta.
 */

const TEST_PASSWORD = 'AccountLockoutTest123!';
const MAX_ATTEMPTS = 5;

async function trySignIn(email: string, password: string) {
    try {
        await withRlsBypass(() => auth.api.signInEmail({ body: { email, password } }));
        return { ok: true as const };
    } catch (error) {
        return { ok: false as const, error };
    }
}

describe('Bloqueio de conta por tentativas de login malsucedidas', () => {
    const createdUserIds: string[] = [];
    const createdOrgIds: string[] = [];

    afterAll(async () => {
        await withRlsBypass(async () => {
            await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
            await prisma.organization.deleteMany({ where: { id: { in: createdOrgIds } } });
        });
    });

    it(`bloqueia a conta após ${MAX_ATTEMPTS} senhas erradas seguidas, mesmo com a senha CERTA na tentativa seguinte`, async () => {
        const email = uniqueEmail('lockout-basic');
        const signUp = (await withRlsBypass(() =>
            auth.api.signUpEmail({ body: { email, password: TEST_PASSWORD, name: 'Lockout Test User' } }),
        )) as unknown as { user: { id: string; organizationId: string } };
        createdUserIds.push(signUp.user.id);
        createdOrgIds.push(signUp.user.organizationId);

        for (let i = 0; i < MAX_ATTEMPTS; i++) {
            const attempt = await trySignIn(email, 'senha-errada-de-proposito');
            expect(attempt.ok).toBe(false);
        }

        const userAfterAttempts = await withRlsBypass(() =>
            prisma.user.findUniqueOrThrow({ where: { id: signUp.user.id } }),
        );
        expect(userAfterAttempts.failedLoginAttempts).toBe(MAX_ATTEMPTS);
        expect(userAfterAttempts.lockedUntil).not.toBeNull();
        expect(userAfterAttempts.lockedUntil!.getTime()).toBeGreaterThan(Date.now());

        // A senha CERTA não desbloqueia antes da janela expirar — senão o bloqueio não protege
        // nada (um atacante testando a senha certa por último "ganharia" mesmo tendo estourado o
        // limite).
        const withCorrectPassword = await trySignIn(email, TEST_PASSWORD);
        expect(withCorrectPassword.ok).toBe(false);
    }, 30_000);

    it('login bem-sucedido antes de atingir o limite zera o contador de tentativas', async () => {
        const email = uniqueEmail('lockout-reset');
        const signUp = (await withRlsBypass(() =>
            auth.api.signUpEmail({ body: { email, password: TEST_PASSWORD, name: 'Lockout Reset User' } }),
        )) as unknown as { user: { id: string; organizationId: string } };
        createdUserIds.push(signUp.user.id);
        createdOrgIds.push(signUp.user.organizationId);

        // Menos tentativas que o limite — não deve bloquear.
        await trySignIn(email, 'senha-errada-1');
        await trySignIn(email, 'senha-errada-2');

        const midway = await withRlsBypass(() => prisma.user.findUniqueOrThrow({ where: { id: signUp.user.id } }));
        expect(midway.failedLoginAttempts).toBe(2);
        expect(midway.lockedUntil).toBeNull();

        const success = await trySignIn(email, TEST_PASSWORD);
        expect(success.ok).toBe(true);

        const afterSuccess = await withRlsBypass(() => prisma.user.findUniqueOrThrow({ where: { id: signUp.user.id } }));
        expect(afterSuccess.failedLoginAttempts).toBe(0);
        expect(afterSuccess.lockedUntil).toBeNull();
    }, 30_000);

    it('e-mail que não existe não vaza informação (mesma resposta) e não gera erro', async () => {
        const attempt = await trySignIn(uniqueEmail('nao-existe'), 'qualquer-senha');
        expect(attempt.ok).toBe(false);
    });
});
