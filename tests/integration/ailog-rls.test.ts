import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { requestContext } from '../../src/lib/async-context';

const ORG_A = 'test-org-id'; // pré-seedado por tests/helpers/integration-setup.ts
const ORG_B = 'test-org-id-ailog-b';

function createLog(organizationId: string | null, promptId: string) {
    return prisma.aILog.create({
        data: {
            organizationId,
            tokens: 123,
            cost: 0.001,
            latencyMs: 42,
            model: 'test-model',
            promptId,
        },
    });
}

async function createInternalUnattributedLog(promptId: string) {
    const id = randomUUID();
    await prisma.$executeRaw`
        INSERT INTO "AILog"
            ("id", "tokens", "cost", "latencyMs", "model", "promptId", "organizationId", "createdAt")
        VALUES
            (${id}, ${123}, ${0.001}, ${42}, ${'test-model'}, ${promptId}, NULL, CURRENT_TIMESTAMP)
    `;
    return id;
}

describe('AILog: contrato RLS da Onda 2.5', () => {
    beforeEach(async () => {
        await requestContext.run({ bypassRls: true }, async () => {
            const orgB = await prisma.organization.findUnique({ where: { id: ORG_B } });
            if (!orgB) {
                await prisma.organization.create({
                    data: { id: ORG_B, name: 'Test Org AILog B' },
                });
            }
            await prisma.aILog.deleteMany({
                where: { promptId: { startsWith: 'onda-2.5-ailog-' } },
            });
        });
    });

    afterEach(async () => {
        await requestContext.run({ bypassRls: true }, async () => {
            await prisma.aILog.deleteMany({
                where: { promptId: { startsWith: 'onda-2.5-ailog-' } },
            });
            await prisma.organization.deleteMany({ where: { id: ORG_B } });
        });
    });

    it('permite escrita tenant-scoped quando o tenant da sessão coincide com organizationId', async () => {
        const row = await requestContext.run({ tenantId: ORG_A }, () =>
            createLog(ORG_A, 'onda-2.5-ailog-tenant-a'),
        );

        expect(row.organizationId).toBe(ORG_A);
    });

    it('bloqueia escrita cross-tenant mesmo quando o payload tenta atribuir outro organizationId', async () => {
        await expect(
            requestContext.run({ tenantId: ORG_A }, () =>
                createLog(ORG_B, 'onda-2.5-ailog-cross-tenant'),
            ),
        ).rejects.toThrow();
    });

    it('bloqueia tenant que tenta fabricar telemetria não atribuída', async () => {
        await expect(
            requestContext.run({ tenantId: ORG_A }, () =>
                createLog(null, 'onda-2.5-ailog-tenant-null'),
            ),
        ).rejects.toThrow();
    });

    it('bloqueia Prisma create NULL sem o corredor interno sem RETURNING', async () => {
        await expect(
            createLog(null, 'onda-2.5-ailog-null-without-internal-path'),
        ).rejects.toThrow();
    });

    it('permite telemetria interna não atribuída pelo papel backend sem tenant ativo', async () => {
        const id = await createInternalUnattributedLog('onda-2.5-ailog-internal-unattributed');

        const persisted = await requestContext.run({ bypassRls: true }, () =>
            prisma.aILog.findUnique({ where: { id } }),
        );
        expect(persisted).not.toBeNull();
        expect(persisted?.organizationId).toBeNull();

        const visibleToTenant = await requestContext.run({ tenantId: ORG_A }, () =>
            prisma.aILog.findMany({
                where: { promptId: 'onda-2.5-ailog-internal-unattributed' },
            }),
        );
        expect(visibleToTenant).toHaveLength(0);
    });

    it('SELECT continua isolado por tenant e não expõe logs de outra organização nem NULL', async () => {
        await requestContext.run({ tenantId: ORG_A }, () =>
            createLog(ORG_A, 'onda-2.5-ailog-visible-a'),
        );
        await requestContext.run({ tenantId: ORG_B }, () =>
            createLog(ORG_B, 'onda-2.5-ailog-hidden-b'),
        );
        await createInternalUnattributedLog('onda-2.5-ailog-hidden-null');

        const rows = await requestContext.run({ tenantId: ORG_A }, () =>
            prisma.aILog.findMany({
                where: { promptId: { startsWith: 'onda-2.5-ailog-' } },
                orderBy: { promptId: 'asc' },
            }),
        );

        expect(rows.some((row) => row.organizationId === ORG_B)).toBe(false);
        expect(rows.some((row) => row.organizationId === null)).toBe(false);
        expect(rows.some((row) => row.promptId === 'onda-2.5-ailog-visible-a')).toBe(true);
        expect(rows.some((row) => row.promptId === 'onda-2.5-ailog-hidden-b')).toBe(false);
    });
});
