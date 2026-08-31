import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeatureFlagsUseCases } from '@/features/feature-flags/application/FeatureFlagsUseCases';
import { AppError } from '@/shared/middlewares/errorHandler';
import type { FeatureFlagRepository, FeatureFlagRecord, OrganizationOverride } from '@/features/feature-flags/domain/FeatureFlag';

// Cobre a lógica de resolução (item 7 da governança de 12 requisitos — Feature Flags):
// override da organização, se existir, senão o default global do catálogo.

function buildFakeRepository(overrides: Partial<FeatureFlagRepository> = {}): FeatureFlagRepository {
    const base: FeatureFlagRepository = {
        upsertCatalogEntry: vi.fn().mockResolvedValue(undefined),
        findByKey: vi.fn().mockResolvedValue(null),
        findByKeyWithOrganizationOverride: vi.fn().mockResolvedValue(null),
        findAllWithOrganizationOverride: vi.fn().mockResolvedValue([]),
        upsertOrganizationOverride: vi.fn().mockResolvedValue(undefined),
        deleteOrganizationOverride: vi.fn().mockResolvedValue(undefined),
    };
    return { ...base, ...overrides };
}

let repo: FeatureFlagRepository;
let useCases: FeatureFlagsUseCases;

beforeEach(() => {
    repo = buildFakeRepository();
    useCases = new FeatureFlagsUseCases(repo);
});

describe('FeatureFlagsUseCases', () => {
    describe('isEnabled', () => {
        it('resolve para false quando a chave não existe no catálogo (fail-closed)', async () => {
            repo = buildFakeRepository({ findByKeyWithOrganizationOverride: vi.fn().mockResolvedValue(null) });
            useCases = new FeatureFlagsUseCases(repo);

            await expect(useCases.isEnabled('flag_inexistente', 'org-1')).resolves.toBe(false);
        });

        it('usa o default global quando a organização não tem override', async () => {
            repo = buildFakeRepository({
                findByKeyWithOrganizationOverride: vi.fn().mockResolvedValue({
                    id: 'flag-1',
                    key: 'bug_report_module',
                    description: 'x',
                    enabled: true,
                    organizationOverride: null,
                } satisfies FeatureFlagRecord & { organizationOverride: OrganizationOverride | null }),
            });
            useCases = new FeatureFlagsUseCases(repo);

            await expect(useCases.isEnabled('bug_report_module', 'org-1')).resolves.toBe(true);
        });

        it('usa o override da organização quando ele existe, mesmo divergindo do default global', async () => {
            repo = buildFakeRepository({
                findByKeyWithOrganizationOverride: vi.fn().mockResolvedValue({
                    id: 'flag-1',
                    key: 'bug_report_module',
                    description: 'x',
                    enabled: true,
                    organizationOverride: { enabled: false },
                }),
            });
            useCases = new FeatureFlagsUseCases(repo);

            await expect(useCases.isEnabled('bug_report_module', 'org-1')).resolves.toBe(false);
        });
    });

    describe('listResolvedForOrganization', () => {
        it('marca isOverridden só quando há override da organização', async () => {
            repo = buildFakeRepository({
                findAllWithOrganizationOverride: vi.fn().mockResolvedValue([
                    { id: 'f1', key: 'flag_a', description: 'A', enabled: true, organizationOverride: null },
                    { id: 'f2', key: 'flag_b', description: 'B', enabled: false, organizationOverride: { enabled: true } },
                ]),
            });
            useCases = new FeatureFlagsUseCases(repo);

            const result = await useCases.listResolvedForOrganization('org-1');

            expect(result).toEqual([
                { key: 'flag_a', description: 'A', enabled: true, isOverridden: false },
                { key: 'flag_b', description: 'B', enabled: true, isOverridden: true },
            ]);
        });
    });

    describe('setOverrideForOrganization / clearOverrideForOrganization', () => {
        it('lança AppError 404 ao tentar sobrescrever uma chave desconhecida', async () => {
            await expect(
                useCases.setOverrideForOrganization('org-1', 'flag_inexistente', true, 'user-1'),
            ).rejects.toMatchObject({ constructor: AppError, statusCode: 404 });
        });

        it('nunca altera o default global — só cria/atualiza o override da própria organização', async () => {
            repo = buildFakeRepository({
                findByKey: vi.fn().mockResolvedValue({ id: 'flag-1', key: 'bug_report_module', description: 'x', enabled: true }),
            });
            useCases = new FeatureFlagsUseCases(repo);

            await useCases.setOverrideForOrganization('org-1', 'bug_report_module', false, 'user-1');

            expect(repo.upsertOrganizationOverride).toHaveBeenCalledWith('org-1', 'flag-1', false, 'user-1');
        });

        it('clearOverrideForOrganization remove só o override da própria organização', async () => {
            repo = buildFakeRepository({
                findByKey: vi.fn().mockResolvedValue({ id: 'flag-1', key: 'bug_report_module', description: 'x', enabled: true }),
            });
            useCases = new FeatureFlagsUseCases(repo);

            await useCases.clearOverrideForOrganization('org-1', 'bug_report_module');

            expect(repo.deleteOrganizationOverride).toHaveBeenCalledWith('org-1', 'flag-1');
        });
    });
});
