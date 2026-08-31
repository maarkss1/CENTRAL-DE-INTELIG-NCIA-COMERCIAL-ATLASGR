import { prisma } from '../../../lib/prisma.js';
import type {
  FeatureFlagRepository,
  FeatureFlagDefinition,
  FeatureFlagRecord,
  OrganizationOverride,
} from '../domain/FeatureFlag.js';

export class PrismaFeatureFlagRepository implements FeatureFlagRepository {
  async upsertCatalogEntry(flag: FeatureFlagDefinition): Promise<void> {
    await prisma.featureFlag.upsert({
      where: { key: flag.key },
      update: { description: flag.description },
      create: {
        key: flag.key,
        description: flag.description,
        enabled: flag.enabledByDefault,
      },
    });
  }

  async findByKey(key: string): Promise<FeatureFlagRecord | null> {
    return prisma.featureFlag.findUnique({ where: { key } });
  }

  async findByKeyWithOrganizationOverride(
    key: string,
    organizationId: string,
  ): Promise<(FeatureFlagRecord & { organizationOverride: OrganizationOverride | null }) | null> {
    const flag = await prisma.featureFlag.findUnique({
      where: { key },
      include: { organizationOverrides: { where: { organizationId } } },
    });
    if (!flag) return null;

    return { ...flag, organizationOverride: flag.organizationOverrides[0] ?? null };
  }

  async findAllWithOrganizationOverride(
    organizationId: string,
  ): Promise<Array<FeatureFlagRecord & { organizationOverride: OrganizationOverride | null }>> {
    const flags = await prisma.featureFlag.findMany({
      include: { organizationOverrides: { where: { organizationId } } },
      orderBy: { key: 'asc' },
    });

    return flags.map((flag) => ({
      ...flag,
      organizationOverride: flag.organizationOverrides[0] ?? null,
    }));
  }

  async upsertOrganizationOverride(
    organizationId: string,
    featureFlagId: string,
    enabled: boolean,
    updatedByUserId: string,
  ): Promise<void> {
    await prisma.organizationFeatureFlag.upsert({
      where: { organizationId_featureFlagId: { organizationId, featureFlagId } },
      update: { enabled, updatedByUserId },
      create: { organizationId, featureFlagId, enabled, updatedByUserId },
    });
  }

  async deleteOrganizationOverride(organizationId: string, featureFlagId: string): Promise<void> {
    await prisma.organizationFeatureFlag.deleteMany({
      where: { organizationId, featureFlagId },
    });
  }
}
