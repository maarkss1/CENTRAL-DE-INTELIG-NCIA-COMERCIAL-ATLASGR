import { Router } from 'express';
import { container } from '../../../shared/di/container.js';
import { UsageController } from '../presentation/UsageController.js';

const router = Router();

router.get('/', (req, res, next) =>
  container.resolve<UsageController>('UsageController').getSummary(req, res, next),
);

export const usageRoutes = router;
