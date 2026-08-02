import { Router, Request, Response, NextFunction } from 'express';

import { activityService } from '../services/activity.service.js';
import { validateRequest } from '../../../shared/middlewares/validateRequest.js';
import { activitySchema, type ActivityStatus, type ActivityType } from '../../../lib/zod.js';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';

const router = Router();

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

        const result = await activityService.findAll(
            orgId,
            date,
            page ? Number(page) : undefined,
            limit ? Number(limit) : undefined,
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

router.post('/', validateRequest(activitySchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { organizationId: orgId } = (req as AuthRequest).user;
        const activity = await activityService.create(orgId, req.body);
        res.status(201).json({ success: true, data: activity });
    } catch (error) {
        next(error);
    }
});

router.put('/:id', validateRequest(activitySchema.partial()), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { organizationId: orgId } = (req as AuthRequest).user;
        const activity = await activityService.update(orgId, req.params.id, req.body);
        res.json({ success: true, data: activity });
    } catch (error) {
        next(error);
    }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { organizationId: orgId } = (req as AuthRequest).user;
        await activityService.delete(orgId, req.params.id);
        res.status(204).send();
    } catch (error) {
        next(error);
    }
});

export const activityRoutes = router;
