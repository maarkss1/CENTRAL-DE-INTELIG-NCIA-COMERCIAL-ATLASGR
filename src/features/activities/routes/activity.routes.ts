import { Router, Request, Response, NextFunction } from 'express';

import { activityService } from '../services/activity.service.js';
import { validateRequest } from '../../../shared/middlewares/validateRequest.js';
import { activitySchema } from '../../../lib/zod.js';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';

const router = Router();

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { organizationId: orgId } = (req as AuthRequest).user;
        const { from, to, date } = req.query as Record<string, string | undefined>;

        // `from`/`to` alimentam a grade do Calendário (um mês por requisição); `date` continua
        // servindo a lista de Agenda, que filtra um dia só.
        const activities = from && to
            ? await activityService.findRange(orgId, from, to)
            : await activityService.findAll(orgId, date);

        res.json({ success: true, data: activities });
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
