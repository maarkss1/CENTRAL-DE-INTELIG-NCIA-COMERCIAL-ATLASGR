import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
    prisma: {
        featureFlag: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            upsert: vi.fn(),
        },
        organizationFeatureFlag: {
            upsert: vi.fn(),
            deleteMany: vi.fn(),
        },
    },
}));

import { prisma } from '@/lib/prisma';
import { PrismaFeatureFlagRepository } from '@/features/feature-flags/infra/PrismaFeatureFlagRepository';

const flag = prisma.featureFlag as unknown as Record<string, ReturnType<typeof vi.fn>>;
const orgFlag = prisma.organizationFeatureFlag as unknown as Record<string, ReturnType<typeof vi.fn>>;
const repo = new PrismaFeatureFlagRepository();

beforeEach(() => {
    vi.clearAllMocks();
});

describe('PrismaFeatureFlagRepository', () => {
    it('findByKeyWithOrganizationOverride devolve null quando a chave não existe', async () => {
        flag.findUnique.mockResolvedValue(null);
        expect(await repo.findByKeyWithOrganizationOverride('x', 'org-1')).toBeNull();
    });

    it('findByKeyWithOrganizationOverride extrai o override único da organização (ou null)', async () => {
        flag.findUnique.mockResolvedValue({
            id: 'flag-1',
            key: 'bug_report_module',
            description: 'x',
            enabled: true,
            organizationOverrides: [{ enabled: false }],
        });

        const result = await repo.findByKeyWithOrganizationOverride('bug_report_module', 'org-1');
        expect(result?.organizationOverride).toEqual({ enabled: false });
    });

    it('findAllWithOrganizationOverride escopa o include por organização', async () => {
        flag.findMany.mockResolvedValue([]);
        await repo.findAllWithOrganizationOverride('org-1');

        expect(flag.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                include: { organizationOverrides: { where: { organizationId: 'org-1' } } },
            }),
        );
    });

    it('upsertOrganizationOverride nunca toca o catálogo global (featureFlag.upsert)', async () => {
        await repo.upsertOrganizationOverride('org-1', 'flag-1', false, 'user-1');

        expect(orgFlag.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { organizationId_featureFlagId: { organizationId: 'org-1', featureFlagId: 'flag-1' } },
            }),
        );
        expect(flag.upsert).not.toHaveBeenCalled();
    });

    it('deleteOrganizationOverride remove só o override da organização pedida', async () => {
        await repo.deleteOrganizationOverride('org-1', 'flag-1');

        expect(orgFlag.deleteMany).toHaveBeenCalledWith({
            where: { organizationId: 'org-1', featureFlagId: 'flag-1' },
        });
    });
});
