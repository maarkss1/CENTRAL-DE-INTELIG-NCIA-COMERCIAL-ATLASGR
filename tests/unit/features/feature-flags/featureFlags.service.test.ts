import { describe, it, expect, vi, beforeEach } from 'vitest';
import { featureFlagsService } from '@/features/feature-flags/featureFlags.service';
import { AppError } from '@/shared/middlewares/errorHandler';
import { prisma } from '@/lib/prisma';

// Cobre a lógica de resolução (item 7 da governança de 12 requisitos — Feature Flags):
// override da organização, se existir, senão o default global do catálogo. Nunca toca banco de
// verdade — só a lógica de featureFlags.service.ts, mockando o Prisma Client.
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

describe('FeatureFlagsService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('isEnabled', () => {
        it('resolve para false quando a chave não existe no catálogo (fail-closed)', async () => {
            vi.mocked(prisma.featureFlag.findUnique).mockResolvedValue(null as never);

            await expect(featureFlagsService.isEnabled('flag_inexistente', 'org-1')).resolves.toBe(false);
        });

        it('usa o default global quando a organização não tem override', async () => {
            vi.mocked(prisma.featureFlag.findUnique).mockResolvedValue({
                id: 'flag-1',
                key: 'bug_report_module',
                description: 'x',
                enabled: true,
                organizationOverrides: [],
            } as never);

            await expect(featureFlagsService.isEnabled('bug_report_module', 'org-1')).resolves.toBe(true);
        });

        it('usa o override da organização quando ele existe, mesmo divergindo do default global', async () => {
            vi.mocked(prisma.featureFlag.findUnique).mockResolvedValue({
                id: 'flag-1',
                key: 'bug_report_module',
                description: 'x',
                enabled: true,
                organizationOverrides: [{ enabled: false }],
            } as never);

            await expect(featureFlagsService.isEnabled('bug_report_module', 'org-1')).resolves.toBe(false);
        });
    });

    describe('listResolvedForOrganization', () => {
        it('marca isOverridden só quando há override da organização', async () => {
            vi.mocked(prisma.featureFlag.findMany).mockResolvedValue([
                { id: 'f1', key: 'flag_a', description: 'A', enabled: true, organizationOverrides: [] },
                { id: 'f2', key: 'flag_b', description: 'B', enabled: false, organizationOverrides: [{ enabled: true }] },
            ] as never);

            const result = await featureFlagsService.listResolvedForOrganization('org-1');

            expect(result).toEqual([
                { key: 'flag_a', description: 'A', enabled: true, isOverridden: false },
                { key: 'flag_b', description: 'B', enabled: true, isOverridden: true },
            ]);
        });
    });

    describe('setOverrideForOrganization / clearOverrideForOrganization', () => {
        it('lança AppError 404 ao tentar sobrescrever uma chave desconhecida', async () => {
            vi.mocked(prisma.featureFlag.findUnique).mockResolvedValue(null as never);

            await expect(
                featureFlagsService.setOverrideForOrganization('org-1', 'flag_inexistente', true, 'user-1')
            ).rejects.toMatchObject({ constructor: AppError, statusCode: 404 });
        });

        it('nunca altera o default global — só cria/atualiza o override da própria organização', async () => {
            vi.mocked(prisma.featureFlag.findUnique).mockResolvedValue({
                id: 'flag-1',
                key: 'bug_report_module',
                description: 'x',
                enabled: true,
            } as never);

            await featureFlagsService.setOverrideForOrganization('org-1', 'bug_report_module', false, 'user-1');

            expect(prisma.organizationFeatureFlag.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { organizationId_featureFlagId: { organizationId: 'org-1', featureFlagId: 'flag-1' } },
                })
            );
            expect(prisma.featureFlag.upsert).not.toHaveBeenCalled();
        });

        it('clearOverrideForOrganization remove só o override da própria organização', async () => {
            vi.mocked(prisma.featureFlag.findUnique).mockResolvedValue({
                id: 'flag-1',
                key: 'bug_report_module',
                description: 'x',
                enabled: true,
            } as never);

            await featureFlagsService.clearOverrideForOrganization('org-1', 'bug_report_module');

            expect(prisma.organizationFeatureFlag.deleteMany).toHaveBeenCalledWith({
                where: { organizationId: 'org-1', featureFlagId: 'flag-1' },
            });
        });
    });
});
