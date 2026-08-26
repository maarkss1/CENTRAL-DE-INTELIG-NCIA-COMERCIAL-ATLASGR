import { Router } from 'express';
import { container } from '../../../shared/di/container.js';
import { AnalyticsController } from '../presentation/AnalyticsController.js';

const router = Router();

router.get('/overview', (req, res, next) => container.resolve<AnalyticsController>('AnalyticsController').getOverview(req, res, next));
router.get('/dashboard', (req, res, next) => container.resolve<AnalyticsController>('AnalyticsController').getDashboard(req, res, next));
router.get('/cohort', (req, res, next) => container.resolve<AnalyticsController>('AnalyticsController').getCohort(req, res, next));
// Renomeado de /export/pdf: a rota nunca gerou um PDF de verdade (buffer fixo, não é um PDF
// válido) — ver AnalyticsController.exportCohortCsv para o raciocínio completo.
router.get('/export/csv', (req, res, next) => container.resolve<AnalyticsController>('AnalyticsController').exportCohortCsv(req, res, next));

export const analyticsRoutes = router;
