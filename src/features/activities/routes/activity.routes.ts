import { Router } from 'express';
import { container } from '../../../shared/di/container.js';
import { ActivityController } from '../presentation/ActivityController.js';
import { validateRequest } from '../../../shared/middlewares/validateRequest.js';
import { activitySchema } from '../../../lib/zod.js';
import { requireRole } from '../../../shared/middlewares/requireRole.js';

const router = Router();
const writeRoles = requireRole(['ADMIN', 'GESTOR', 'CLOSER', 'SDR']);

router.get('/', (req, res, next) =>
    container.resolve<ActivityController>('ActivityController').getActivities(req, res, next)
);

router.post('/', writeRoles, validateRequest(activitySchema), (req, res, next) =>
    container.resolve<ActivityController>('ActivityController').createActivity(req, res, next)
);

router.put('/:id', writeRoles, validateRequest(activitySchema.partial()), (req, res, next) =>
    container.resolve<ActivityController>('ActivityController').updateActivity(req, res, next)
);

router.delete('/:id', requireRole(['ADMIN', 'GESTOR']), (req, res, next) =>
    container.resolve<ActivityController>('ActivityController').deleteActivity(req, res, next)
);

export const activityRoutes = router;
