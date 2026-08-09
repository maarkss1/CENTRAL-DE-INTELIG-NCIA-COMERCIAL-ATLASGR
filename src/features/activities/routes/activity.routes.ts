import { Router, Request, Response, NextFunction } from 'express';

import { activityService } from '../services/activity.service.js';
import { validateRequest } from '../../../shared/middlewares/validateRequest.js';
import { activitySchema, type ActivityStatus, type ActivityType } from '../../../lib/zod.js';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';
import { requireRole } from '../../../shared/middlewares/requireRole.js';

const router = Router();
const writeRoles = requireRole(['ADMIN', 'GESTOR', 'VENDEDOR']);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { organizationId: orgId } = (req as AuthRequest).user;
        const { from, to, date, page, limit, leadId, status, type } = req.query as Record<string, string | undefined>;

        // `from`/`to` alimentam a grade do Calendário (um mês por requisição, sem paginação —
        // volume já é limitado pela janela de datas); os demais parâmetros servem a lista de
        // Agenda paginada.
        if (from && to) {
            const activities = await activityService.findRange(orgId, from, to);
            res.json({ success: true, data: activities });
            return;
        }

        const pageNum = page ? Number.parseInt(page, 10) : undefined;
        const limitNum = limit ? Number.parseInt(limit, 10) : undefined;

        const result = await activityService.findAll(
            orgId,
            date,
            pageNum !== undefined && Number.isFinite(pageNum) && pageNum > 0 ? pageNum : undefined,
            limitNum !== undefined && Number.isFinite(limitNum) && limitNum > 0 ? limitNum : undefined,
            {
                leadId,
                status: status as ActivityStatus | undefined,
                type: type as ActivityType | undefined,
            }
        );

        res.json({ success: true, data: result.data, meta: result.meta });
    } catch (error) {
        next(error);
    }
});

router.post('/', writeRoles, validateRequest(activitySchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { organizationId: orgId } = (req as AuthRequest).user;
        const activity = await activityService.create(orgId, req.body);
        res.status(201).json({ success: true, data: activity });
    } catch (error) {
        next(error);
    }
});

router.put('/:id', writeRoles, validateRequest(activitySchema.partial()), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { organizationId: orgId } = (req as AuthRequest).user;
        const activity = await activityService.update(orgId, req.params.id, req.body);
        res.json({ success: true, data: activity });
    } catch (error) {
        next(error);
    }
});

router.delete('/:id', requireRole(['ADMIN', 'GESTOR']), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { organizationId: orgId } = (req as AuthRequest).user;
        await activityService.delete(orgId, req.params.id);
        res.status(204).send();
    } catch (error) {
        next(error);
    }
});

export const activityRoutes = router;
