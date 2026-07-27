import { Router } from 'express';

import { validateRequest } from '../../../shared/middlewares/validateRequest.js';
import { requireRole } from '../../../shared/middlewares/requireRole.js';
import { leadSchema } from '../../../lib/zod.js';
import { container } from '../../../shared/di/container.js';
import { LeadController } from '../presentation/LeadController.js';

const router = Router();

router.get('/', (req, res, next) => container.resolve<LeadController>('LeadController').getLeads(req, res, next));
router.get('/export/csv', (req, res, next) => container.resolve<LeadController>('LeadController').exportCsv(req, res, next));
router.post('/export/bitrix24', (req, res, next) => container.resolve<LeadController>('LeadController').exportToBitrix24(req, res, next));
router.get('/:id', (req, res, next) => container.resolve<LeadController>('LeadController').getLeadById(req, res, next));
router.post('/', validateRequest(leadSchema), (req, res, next) => container.resolve<LeadController>('LeadController').createLead(req, res, next));
router.put('/:id', validateRequest(leadSchema.partial()), (req, res, next) => container.resolve<LeadController>('LeadController').updateLead(req, res, next));

// Apenas ADMIN e GESTOR podem deletar leads
router.delete('/:id', requireRole(['ADMIN', 'GESTOR']), (req, res, next) => container.resolve<LeadController>('LeadController').deleteLead(req, res, next));

// Reenriquece um lead já prospectado
router.post('/:id/enrich', (req, res, next) => container.resolve<LeadController>('LeadController').enrichLead(req, res, next));

export const leadRoutes = router;
