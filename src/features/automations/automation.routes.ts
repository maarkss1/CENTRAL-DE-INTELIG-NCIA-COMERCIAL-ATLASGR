import { Router, Request, Response, NextFunction } from 'express';
import { automationService, automationSchema, AUTOMATION_TRIGGERS, AUTOMATION_ACTIONS } from './automation.service.js';
import { validateRequest } from '../../shared/middlewares/validateRequest.js';
import type { AuthRequest } from '../../shared/middlewares/authenticateToken.js';

const router = Router();

/** Opções que a tela usa para montar os selects, para o frontend não duplicar os enums. */
router.get('/options', (_req: Request, res: Response) => {
    res.json({
        success: true,
        data: { triggers: AUTOMATION_TRIGGERS, actions: AUTOMATION_ACTIONS },
    });
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        res.json({ success: true, data: await automationService.list(organizationId) });
    } catch (error) {
        next(error);
    }
});

router.post('/', validateRequest(automationSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const created = await automationService.create(organizationId, req.body);
        res.status(201).json({ success: true, data: created });
    } catch (error) {
        next(error);
    }
});

router.put('/:id', validateRequest(automationSchema.partial()), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const updated = await automationService.update(organizationId, req.params.id, req.body);
        if (!updated) {
            res.status(404).json({ success: false, error: 'Automação não encontrada.' });
            return;
        }
        res.json({ success: true, data: updated });
    } catch (error) {
        next(error);
    }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const ok = await automationService.remove(organizationId, req.params.id);
        if (!ok) {
            res.status(404).json({ success: false, error: 'Automação não encontrada.' });
            return;
        }
        res.status(204).send();
    } catch (error) {
        next(error);
    }
});

export const automationRoutes = router;
