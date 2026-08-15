import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { AppError } from '../../shared/middlewares/errorHandler.js';
import { FEATURE_FLAG_REGISTRY } from './featureFlags.registry.js';

export interface ResolvedFeatureFlag {
    key: string;
    description: string;
    enabled: boolean;
    /** true quando o valor efetivo vem de um override da organização, não do default global. */
    isOverridden: boolean;
}

export class FeatureFlagsService {
    /**
     * Garante, de forma idempotente, que toda chave declarada em FEATURE_FLAG_REGISTRY existe
     * como linha em FeatureFlag — chamado uma vez no boot do servidor (server.ts). Não apaga
     * chaves órfãs (removidas do registro em código mas ainda no banco): um flag "morto" só de
     * catálogo não tem efeito nenhum sem nenhum caller checando `isEnabled(key, ...)`.
     */
    async syncRegistry(): Promise<void> {
        for (const flag of FEATURE_FLAG_REGISTRY) {
            await prisma.featureFlag.upsert({
                where: { key: flag.key },
                update: { description: flag.description },
                create: { key: flag.key, description: flag.description, enabled: flag.enabledByDefault },
            });
        }
        logger.info({ count: FEATURE_FLAG_REGISTRY.length }, '[FeatureFlags] Catálogo sincronizado');
    }

    /** Lista resolvida (default global + override da organização já aplicado) para exibição/uso. */
    async listResolvedForOrganization(organizationId: string): Promise<ResolvedFeatureFlag[]> {
        const flags = await prisma.featureFlag.findMany({
            include: { organizationOverrides: { where: { organizationId } } },
            orderBy: { key: 'asc' },
        });

        return flags.map((flag) => {
            const override = flag.organizationOverrides[0];
            return {
                key: flag.key,
                description: flag.description,
                enabled: override ? override.enabled : flag.enabled,
                isOverridden: Boolean(override),
            };
        });
    }

    /** Checagem pontual — usada por outras features do backend para decidir comportamento. */
    async isEnabled(key: string, organizationId: string): Promise<boolean> {
        const flag = await prisma.featureFlag.findUnique({
            where: { key },
            include: { organizationOverrides: { where: { organizationId } } },
        });
        // Chave desconhecida (nunca registrada) resolve para desligada — mesmo raciocínio
        // fail-closed de UNVERIFIED_ROLE em src/lib/auth/authorization.ts: um flag que não existe
        // nunca deve acidentalmente liberar um comportamento.
        if (!flag) return false;

        const override = flag.organizationOverrides[0];
        return override ? override.enabled : flag.enabled;
    }

    /** ADMIN liga/desliga um flag só para a própria organização — nunca o default global. */
    async setOverrideForOrganization(
        organizationId: string,
        key: string,
        enabled: boolean,
        updatedByUserId: string
    ): Promise<ResolvedFeatureFlag> {
        const flag = await prisma.featureFlag.findUnique({ where: { key } });
        if (!flag) {
            throw new AppError(`Feature flag desconhecida: "${key}".`, 404);
        }

        await prisma.organizationFeatureFlag.upsert({
            where: { organizationId_featureFlagId: { organizationId, featureFlagId: flag.id } },
            update: { enabled, updatedByUserId },
            create: { organizationId, featureFlagId: flag.id, enabled, updatedByUserId },
        });

        logger.info({ organizationId, key, enabled, updatedByUserId }, '[FeatureFlags] Override de organização alterado');

        return { key: flag.key, description: flag.description, enabled, isOverridden: true };
    }

    /** Remove o override da organização, revertendo o flag para o default global do catálogo. */
    async clearOverrideForOrganization(organizationId: string, key: string): Promise<ResolvedFeatureFlag> {
        const flag = await prisma.featureFlag.findUnique({ where: { key } });
        if (!flag) {
            throw new AppError(`Feature flag desconhecida: "${key}".`, 404);
        }

        await prisma.organizationFeatureFlag.deleteMany({ where: { organizationId, featureFlagId: flag.id } });

        logger.info({ organizationId, key }, '[FeatureFlags] Override de organização removido');

        return { key: flag.key, description: flag.description, enabled: flag.enabled, isOverridden: false };
    }
}

export const featureFlagsService = new FeatureFlagsService();
