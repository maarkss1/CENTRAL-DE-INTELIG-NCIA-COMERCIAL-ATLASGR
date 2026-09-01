/**
 * Catálogo de feature flags conhecidas pela plataforma — definido em código (revisado em PR),
 * não criável livremente via API. `FeatureFlagsUseCases.syncRegistry()` garante, no boot do
 * servidor, que toda chave aqui existe como linha em `FeatureFlag` (upsert idempotente); o valor
 * default global fica ali. O que É alterável em runtime, sem deploy, é o override por
 * organização (`OrganizationFeatureFlag`, via PUT/DELETE /api/feature-flags/:key, só ADMIN).
 *
 * Isto é deliberadamente mais restrito que "qualquer ADMIN pode criar/editar o default global de
 * qualquer flag": um ADMIN de uma organização não deve conseguir mudar o comportamento de TODAS
 * as outras organizações só alterando o catálogo global — só o próprio tenant.
 */
export interface FeatureFlagDefinition {
  key: string;
  description: string;
  enabledByDefault: boolean;
}

export const FEATURE_FLAG_REGISTRY: readonly FeatureFlagDefinition[] = [
  {
    key: 'bug_report_module',
    description: 'Exibe o botão flutuante "Reportar problema" no frontend, para todas as marcas.',
    enabledByDefault: true,
  },
];

export interface ResolvedFeatureFlag {
  key: string;
  description: string;
  enabled: boolean;
  /** true quando o valor efetivo vem de um override da organização, não do default global. */
  isOverridden: boolean;
  /** Id do ADMIN que fez a última alteração do override — só presente quando `isOverridden` é
   *  true (o default global do catálogo não tem "quem alterou"). Sem FK (ver
   *  OrganizationFeatureFlag no schema): pode apontar para um usuário já removido. */
  updatedByUserId?: string | null;
  /** Quando o override foi alterado pela última vez — mesma condição de `updatedByUserId`. */
  updatedAt?: Date | null;
}

export interface FeatureFlagRecord {
  id: string;
  key: string;
  description: string;
  enabled: boolean;
}

export interface OrganizationOverride {
  enabled: boolean;
  updatedByUserId?: string | null;
  updatedAt?: Date;
}

export interface FeatureFlagRepository {
  upsertCatalogEntry(flag: FeatureFlagDefinition): Promise<void>;
  findByKey(key: string): Promise<FeatureFlagRecord | null>;
  findByKeyWithOrganizationOverride(
    key: string,
    organizationId: string,
  ): Promise<(FeatureFlagRecord & { organizationOverride: OrganizationOverride | null }) | null>;
  findAllWithOrganizationOverride(
    organizationId: string,
  ): Promise<Array<FeatureFlagRecord & { organizationOverride: OrganizationOverride | null }>>;
  upsertOrganizationOverride(
    organizationId: string,
    featureFlagId: string,
    enabled: boolean,
    updatedByUserId: string,
  ): Promise<void>;
  deleteOrganizationOverride(organizationId: string, featureFlagId: string): Promise<void>;
}
