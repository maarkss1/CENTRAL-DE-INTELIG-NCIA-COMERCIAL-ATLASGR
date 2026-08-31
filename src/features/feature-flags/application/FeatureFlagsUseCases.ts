import type { FeatureFlagRepository, ResolvedFeatureFlag } from '../domain/FeatureFlag.js';
import { FEATURE_FLAG_REGISTRY } from '../domain/FeatureFlag.js';
import { logger } from '../../../lib/logger.js';
import { AppError } from '../../../shared/middlewares/errorHandler.js';

function isTransactionAcquireTimeout(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2028'
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export class FeatureFlagsUseCases {
  constructor(private featureFlagRepository: FeatureFlagRepository) {}

  /**
   * Garante, de forma idempotente, que toda chave declarada em FEATURE_FLAG_REGISTRY existe
   * como linha em FeatureFlag — chamado uma vez no boot do servidor (server.ts). Não apaga
   * chaves órfãs (removidas do registro em código mas ainda no banco): um flag "morto" só de
   * catálogo não tem efeito nenhum sem nenhum caller checando `isEnabled(key, ...)`.
   *
   * O Prisma usa transações curtas para aplicar o contexto RLS. Em produção, durante cold-start
   * do Render/Supabase, a aquisição da transação pode excepcionalmente estourar o maxWait padrão
   * e retornar P2028 antes de qualquer SQL do upsert executar. Esse erro específico é transitório
   * e seguro de repetir porque o upsert é idempotente. Outros erros sobem imediatamente: não há
   * retry para constraint, SQL inválido, RLS ou falhas de aplicação.
   */
  async syncRegistry(): Promise<void> {
    const maxAttempts = 4;

    for (const flag of FEATURE_FLAG_REGISTRY) {
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          await this.featureFlagRepository.upsertCatalogEntry(flag);
          break;
        } catch (error) {
          if (!isTransactionAcquireTimeout(error) || attempt === maxAttempts) {
            throw error;
          }

          const delayMs = 250 * 2 ** (attempt - 1);
          logger.warn(
            { key: flag.key, attempt, maxAttempts, delayMs },
            '[FeatureFlags] P2028 transitório ao adquirir transação; repetindo sync',
          );
          await sleep(delayMs);
        }
      }
    }
    logger.info({ count: FEATURE_FLAG_REGISTRY.length }, '[FeatureFlags] Catálogo sincronizado');
  }

  /** Lista resolvida (default global + override da organização já aplicado) para exibição/uso. */
  async listResolvedForOrganization(organizationId: string): Promise<ResolvedFeatureFlag[]> {
    const flags = await this.featureFlagRepository.findAllWithOrganizationOverride(organizationId);

    return flags.map((flag) => ({
      key: flag.key,
      description: flag.description,
      enabled: flag.organizationOverride ? flag.organizationOverride.enabled : flag.enabled,
      isOverridden: Boolean(flag.organizationOverride),
    }));
  }

  /** Checagem pontual — usada por outras features do backend para decidir comportamento. */
  async isEnabled(key: string, organizationId: string): Promise<boolean> {
    const flag = await this.featureFlagRepository.findByKeyWithOrganizationOverride(
      key,
      organizationId,
    );
    // Chave desconhecida (nunca registrada) resolve para desligada — mesmo raciocínio
    // fail-closed de UNVERIFIED_ROLE em src/lib/auth/authorization.ts: um flag que não existe
    // nunca deve acidentalmente liberar um comportamento.
    if (!flag) return false;

    return flag.organizationOverride ? flag.organizationOverride.enabled : flag.enabled;
  }

  /** ADMIN liga/desliga um flag só para a própria organização — nunca o default global. */
  async setOverrideForOrganization(
    organizationId: string,
    key: string,
    enabled: boolean,
    updatedByUserId: string,
  ): Promise<ResolvedFeatureFlag> {
    const flag = await this.featureFlagRepository.findByKey(key);
    if (!flag) {
      throw new AppError(`Feature flag desconhecida: "${key}".`, 404);
    }

    await this.featureFlagRepository.upsertOrganizationOverride(
      organizationId,
      flag.id,
      enabled,
      updatedByUserId,
    );

    logger.info(
      { organizationId, key, enabled, updatedByUserId },
      '[FeatureFlags] Override de organização alterado',
    );

    return { key: flag.key, description: flag.description, enabled, isOverridden: true };
  }

  /** Remove o override da organização, revertendo o flag para o default global do catálogo. */
  async clearOverrideForOrganization(
    organizationId: string,
    key: string,
  ): Promise<ResolvedFeatureFlag> {
    const flag = await this.featureFlagRepository.findByKey(key);
    if (!flag) {
      throw new AppError(`Feature flag desconhecida: "${key}".`, 404);
    }

    await this.featureFlagRepository.deleteOrganizationOverride(organizationId, flag.id);

    logger.info({ organizationId, key }, '[FeatureFlags] Override de organização removido');

    return {
      key: flag.key,
      description: flag.description,
      enabled: flag.enabled,
      isOverridden: false,
    };
  }
}
