import { Router, Request, Response, NextFunction } from 'express';
import { analyticsService } from '../analytics.service.js';
import { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';

const router = Router();

/** Limites do parâmetro `months` do dashboard. */
const MIN_MONTHS = 3;
const MAX_MONTHS = 24;
const DEFAULT_MONTHS = 6;

function parseMonths(raw: unknown): number {
    const parsed = Number.parseInt(String(raw ?? ''), 10);
    if (!Number.isFinite(parsed)) return DEFAULT_MONTHS;
    return Math.min(Math.max(parsed, MIN_MONTHS), MAX_MONTHS);
}

/**
 * Visão geral usada pelo LiveStatsWidget (home) e pelo ReportsHub (relatório executivo por IA).
 *
 * Esta rota devolvia números fictícios (7 empresas, R$ 450k de pipeline, 14,2% de conversão) sempre
 * que o banco estava vazio ou fora do ar, enquanto a UI anunciava "PostgreSQL Conectado". Isso saiu:
 * base vazia responde zero, e falha de banco responde erro de verdade. Um dashboard que inventa
 * número é pior do que um dashboard que não carrega.
 */
router.get('/overview', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const data = await analyticsService.overview(organizationId);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

/** Dashboard completo da tela de Analytics, numa única requisição. */
router.get('/dashboard', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const data = await analyticsService.dashboard(organizationId, parseMonths(req.query.months));
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

export const analyticsRoutes = router;
