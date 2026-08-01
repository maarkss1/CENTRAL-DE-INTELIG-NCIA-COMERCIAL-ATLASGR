import { Router, Request, Response, NextFunction } from 'express';
import { notificationService } from './notification.service.js';
import type { AuthRequest } from '../../shared/middlewares/authenticateToken.js';

const router = Router();

/** GET /api/notifications?unread=1 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { organizationId, id: userId } = (req as AuthRequest).user;
        const onlyUnread = req.query.unread === '1' || req.query.unread === 'true';
        const [items, unread] = await Promise.all([
            notificationService.list(organizationId, userId, onlyUnread),
            notificationService.unreadCount(organizationId, userId),
        ]);
        res.json({ success: true, data: { items, unread } });
    } catch (error) {
        next(error);
    }
});

/** POST /api/notifications/:id/read */
router.post('/:id/read', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const ok = await notificationService.markRead(organizationId, req.params.id);
        if (!ok) {
            res.status(404).json({ success: false, error: 'Notificação não encontrada ou já lida.' });
            return;
        }
        res.json({ success: true, data: { id: req.params.id } });
    } catch (error) {
        next(error);
    }
});

/** POST /api/notifications/read-all */
router.post('/read-all', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { organizationId, id: userId } = (req as AuthRequest).user;
        const count = await notificationService.markAllRead(organizationId, userId);
        res.json({ success: true, data: { count } });
    } catch (error) {
        next(error);
    }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const ok = await notificationService.remove(organizationId, req.params.id);
        if (!ok) {
            res.status(404).json({ success: false, error: 'Notificação não encontrada.' });
            return;
        }
        res.status(204).send();
    } catch (error) {
        next(error);
    }
});

export const notificationRoutes = router;
