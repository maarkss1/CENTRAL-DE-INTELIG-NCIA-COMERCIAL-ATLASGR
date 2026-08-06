import { Router } from 'express';
import { container } from '../../../shared/di/container.js';
import { AnalyticsController } from '../presentation/AnalyticsController.js';

const router = Router();

router.get('/overview', (req, res, next) => container.resolve<AnalyticsController>('AnalyticsController').getOverview(req, res, next));
router.get('/dashboard', (req, res, next) => container.resolve<AnalyticsController>('AnalyticsController').getDashboard(req, res, next));

export const analyticsRoutes = router;
