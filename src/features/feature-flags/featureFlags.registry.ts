/**
 * Catálogo de feature flags conhecidas pela plataforma — definido em código (revisado em PR),
 * não criável livremente via API. `featureFlags.service.ts#syncRegistry()` garante, no boot do
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
