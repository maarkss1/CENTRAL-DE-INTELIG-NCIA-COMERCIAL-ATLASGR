import { setupDI } from '../shared/di/setup.js';
import { requestContext } from '../lib/async-context.js';
import { featureFlagsService } from '../features/feature-flags/featureFlags.service.js';
import { logger } from '../lib/logger.js';

/**
 * Inicializa os serviços de aplicação que não são middlewares HTTP: injeção de dependência
 * (repositórios/casos de uso/controllers) e a sincronização do catálogo de feature flags com o
 * banco. Deve rodar depois de todas as rotas montadas e antes do `app.listen(...)`, mesma posição
 * do server.ts original.
 */
export function bootstrapApplicationServices(): void {
    setupDI();

    // Sincroniza o catálogo de feature flags (FEATURE_FLAG_REGISTRY) com a tabela FeatureFlag —
    // idempotente, roda a cada boot. Não bloqueia a subida do servidor por um erro aqui (ex.:
    // banco temporariamente indisponível): loga e segue, mesmo raciocínio dos jobs de
    // agendamento em workers.ts. `bypassRls: true` é necessário aqui: roda antes de qualquer
    // request HTTP existir, sem tenant conhecido — ver FeatureFlag em BYPASS_RLS_ALLOWED_MODELS
    // (src/lib/prisma.ts) para o porquê de ser seguro.
    requestContext.run({ bypassRls: true }, () =>
        featureFlagsService.syncRegistry().catch((err) =>
            logger.error({ err }, 'Falha ao sincronizar catálogo de feature flags no boot')
        )
    );
}
