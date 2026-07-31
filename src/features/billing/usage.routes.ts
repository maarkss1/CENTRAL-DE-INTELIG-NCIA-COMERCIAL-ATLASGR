import { Router, Request, Response, NextFunction } from 'express';
import { usageService } from './usage.service.js';
import type { AuthRequest } from '../../shared/middlewares/authenticateToken.js';

const router = Router();

const MIN_DAYS = 7;
const MAX_DAYS = 90;
const DEFAULT_DAYS = 30;

function parseDays(raw: unknown): number {
    const parsed = Number.parseInt(String(raw ?? ''), 10);
    if (!Number.isFinite(parsed)) return DEFAULT_DAYS;
    return Math.min(Math.max(parsed, MIN_DAYS), MAX_DAYS);
}

/** GET /api/usage?days=30 — consumo de IA da organização. */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const data = await usageService.summary(organizationId, parseDays(req.query.days));
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

export const usageRoutes = router;
