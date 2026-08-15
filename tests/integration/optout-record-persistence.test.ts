import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { requestContext } from '../../src/lib/async-context';
import { prismaOptOutRepository } from '../../src/features/cadence/infra/PrismaOptOutRepository';
import { recordOptOut, isOptedOut } from '../../src/features/cadence/application/optOutService';

/**
 * Prova, contra Postgres real, que `PrismaOptOutRepository` (adaptador real de `OptOutRepository`,
 * ver `.agents/handoffs/onda-7/17-para-05-06-12-contrato-optout.md`) casa/isola exatamente como
 * `InMemoryOptOutRepository` já prova em `src/features/cadence/__tests__/optOut.test.ts` — este
 * arquivo não repete a lógica de matching (já testada em memória), só confirma que o round-trip
 * via Prisma/RLS não perde nada.
 *
 * Cada teste faz create+read dentro de um único `requestContext.run()` (nunca dois separados) —
 * mesma cautela documentada em `tests/integration/threecx-persistence.test.ts` por causa do bug de
 * plataforma conhecido em `executeWithRls` (ver Onda 9), para este teste não ficar flaky por um
 * motivo alheio ao que ele prova.
 */

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ORG_A = `test-optout-org-a-${RUN_ID}`;
const ORG_B = `test-optout-org-b-${RUN_ID}`;

const withRlsBypass = <T>(fn: () => Promise<T>): Promise<T> => requestContext.run({ bypassRls: true }, fn);
const asOrg = <T>(organizationId: string, fn: () => Promise<T>): Promise<T> =>
    requestContext.run({ tenantId: organizationId }, fn);

beforeAll(async () => withRlsBypass(async () => {
    await prisma.organization.createMany({
        data: [
            { id: ORG_A, name: 'Test Org A (opt-out)' },
            { id: ORG_B, name: 'Test Org B (opt-out)' },
        ],
        skipDuplicates: true,
    });
}));

afterEach(async () => withRlsBypass(async () => {
    await prisma.optOutRecord.deleteMany({ where: { organizationId: { in: [ORG_A, ORG_B] } } });
}));

afterAll(async () => withRlsBypass(async () => {
    await prisma.optOutRecord.deleteMany({ where: { organizationId: { in: [ORG_A, ORG_B] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [ORG_A, ORG_B] } } });
}));

describe('PrismaOptOutRepository contra Postgres real', () => {
    it('registra e recupera um opt-out global bloqueando os 3 canais, tudo dentro do mesmo contexto de tenant', async () => {
        const result = await asOrg(ORG_A, async () => {
            await recordOptOut(prismaOptOutRepository, {
                organizationId: ORG_A,
                scope: 'global',
                subject: { email: 'lead@example.com' },
                originChannel: 'email',
                reason: 'Pediu para não ser mais contatado',
                evidence: '"Por favor, não me mande mais nada"',
            });

            return {
                email: await isOptedOut(prismaOptOutRepository, ORG_A, { email: 'lead@example.com' }, 'email'),
                whatsapp: await isOptedOut(prismaOptOutRepository, ORG_A, { email: 'lead@example.com' }, 'whatsapp'),
                voice: await isOptedOut(prismaOptOutRepository, ORG_A, { email: 'lead@example.com' }, 'voice'),
            };
        });

        expect(result).toEqual({ email: true, whatsapp: true, voice: true });
    });

    it('opt-out restrito a um canal não bloqueia os outros dois', async () => {
        const result = await asOrg(ORG_A, async () => {
            await recordOptOut(prismaOptOutRepository, {
                organizationId: ORG_A,
                scope: 'voice',
                subject: { phoneE164: '+5511999998888' },
                originChannel: 'voice',
                reason: 'Não quer mais ligação, mas aceita e-mail',
            });

            return {
                voice: await isOptedOut(prismaOptOutRepository, ORG_A, { phoneE164: '+5511999998888' }, 'voice'),
                email: await isOptedOut(prismaOptOutRepository, ORG_A, { phoneE164: '+5511999998888' }, 'email'),
            };
        });

        expect(result).toEqual({ voice: true, email: false });
    });

    it('RLS: opt-out da organização A é invisível para consulta na organização B com o mesmo identificador', async () => {
        await asOrg(ORG_A, () =>
            recordOptOut(prismaOptOutRepository, {
                organizationId: ORG_A,
                scope: 'global',
                subject: { email: 'compartilhado@example.com' },
                originChannel: 'manual',
            }),
        );

        const blockedInB = await asOrg(ORG_B, () =>
            isOptedOut(prismaOptOutRepository, ORG_B, { email: 'compartilhado@example.com' }, 'email'),
        );
        expect(blockedInB).toBe(false);
    });
});
