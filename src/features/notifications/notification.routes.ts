import { Router, type Request, type Response, type NextFunction } from 'express';
import { notificationService } from './notification.service.js';
import { hasRequiredRole } from '../../lib/auth/authorization.js';
import type { AuthRequest } from '../../shared/middlewares/authenticateToken.js';
import { routeParam } from '../../shared/http/routeParams.js';

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
    const { organizationId, id: userId } = (req as AuthRequest).user;
    const notificationId = routeParam(req.params.id, 'id');
    const ok = await notificationService.markRead(organizationId, notificationId, userId);
    if (!ok) {
      res.status(404).json({ success: false, error: 'Notificação não encontrada ou já lida.' });
      return;
    }
    res.json({ success: true, data: { id: notificationId } });
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
    const { organizationId, id: userId, role } = (req as AuthRequest).user;
    const canManageBroadcast = hasRequiredRole(role, ['ADMIN', 'GESTOR']);
    const ok = await notificationService.remove(
      organizationId,
      routeParam(req.params.id, 'id'),
      userId,
      canManageBroadcast,
    );
    if (!ok) {
      res.status(404).json({
        success: false,
        error: canManageBroadcast
          ? 'Notificação não encontrada.'
          : 'Notificação não encontrada, ou é um aviso da organização inteira (só ADMIN/GESTOR pode excluir).',
      });
      return;
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export const notificationRoutes = router;
