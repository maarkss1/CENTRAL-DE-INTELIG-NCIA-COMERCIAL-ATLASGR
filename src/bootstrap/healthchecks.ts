import type { Express, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { queuesEnabled, connection } from '../lib/queue/redis.js';
import { logger } from '../lib/logger.js';

export function handleLiveness(_req: Request, res: Response): void {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
}

export async function handleReadiness(_req: Request, res: Response): Promise<void> {
    try {
        await prisma.$queryRaw`SELECT 1`;
        if (queuesEnabled) {
            await connection.ping();
        }
        res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
    } catch (error) {
        logger.error({ err: error }, 'Readiness probe failed');
        res.status(503).json({ status: 'error', message: 'Database or Redis unavailable' });
    }
}

/**
 * Health checks consumidos pelo orquestrador de deploy (liveness = processo está de pé;
 * readiness = processo consegue atender tráfego real — banco e, quando aplicável, Redis
 * respondem). Duas rotas por sonda (`/health/*` e a forma curta `/*z`) por compatibilidade com
 * convenções diferentes de orquestrador.
 */
export function mountHealthChecks(app: Express): void {
    app.get('/health/live', handleLiveness);
    app.get('/healthz', handleLiveness);
    app.get('/health/ready', handleReadiness);
    app.get('/readyz', handleReadiness);
}
