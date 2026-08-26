import type { Express } from 'express';
import { ExpressAdapter } from '@bull-board/express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { leadsQueue } from '../lib/queue/index.js';
import { searchQueue } from '../lib/queue/search.queue.js';
import { agentQueue } from '../lib/queue/agent.worker.js';
import { queuesEnabled } from '../lib/queue/redis.js';
import { authenticateToken } from '../shared/middlewares/authenticateToken.js';
import { requireTenant } from '../shared/middlewares/authorization.js';
import { requireRole } from '../shared/middlewares/requireRole.js';
import { requirePlatformOperator } from '../shared/middlewares/requirePlatformOperator.js';

/**
 * UI de monitoramento de filas (BullBoard) em /admin/queues. Painel administrativo: além de
 * autenticação, exige papel ADMIN — os jobs exibidos aqui carregam dados de TODAS as organizações
 * (filas são globais, não por tenant), então qualquer usuário comum autenticado poder abrir isso
 * era exposição cross-tenant. Restringir a ADMIN reduz a superfície ao papel mais alto existente;
 * o risco residual (ADMIN de uma organização enxergar jobs de outra) fica documentado no
 * relatório de segurança.
 *
 * SEC-001 (Sprint 01/Onda 13): `requirePlatformOperator` é a segunda trava, obrigatória —
 * ADMIN de uma organização não é automaticamente "operador de infraestrutura" (a distinção que
 * o próprio pacote SEC-001 pede). Sem PLATFORM_OPERATOR_TOKEN configurado, a rota nega por
 * padrão mesmo para um ADMIN de verdade.
 */
export function mountBullBoard(app: Express): void {
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/admin/queues');
    if (queuesEnabled && leadsQueue && searchQueue && agentQueue) {
        createBullBoard({
            queues: [
                new BullMQAdapter(leadsQueue),
                new BullMQAdapter(searchQueue),
                new BullMQAdapter(agentQueue)
            ],
            serverAdapter,
        });
    }

    app.use(
        '/admin/queues',
        authenticateToken,
        requireTenant,
        requireRole(['ADMIN']),
        requirePlatformOperator,
        serverAdapter.getRouter()
    );
}
