import { Router } from 'express';

import { validateRequest } from '../../../shared/middlewares/validateRequest.js';
import { requireRole } from '../../../shared/middlewares/requireRole.js';
import { requireLeadOwnership } from '../../../shared/middlewares/requireLeadOwnership.js';
import { leadSchema } from '../../../lib/zod.js';
import { container } from '../../../shared/di/container.js';
import { LeadController } from '../presentation/LeadController.js';

const router = Router();
const managementRoles = requireRole(['ADMIN', 'GESTOR']);
const writeRoles = requireRole(['ADMIN', 'GESTOR', 'CLOSER', 'SDR']);
// CLOSER/SDR só edita/exclui/reenriquece leads que ele mesmo capturou — GESTOR/ADMIN continuam sem
// restrição (ver requireLeadOwnership.ts).
const ownLeadOnly = requireLeadOwnership();

router.get('/', (req, res, next) => container.resolve<LeadController>('LeadController').getLeads(req, res, next));
// Export/import em massa é sensível (LGPD) — restrito a ADMIN/GESTOR.
router.get('/export/csv', managementRoles, (req, res, next) => container.resolve<LeadController>('LeadController').exportCsv(req, res, next));
router.post('/export/bitrix24', managementRoles, (req, res, next) => container.resolve<LeadController>('LeadController').exportToBitrix24(req, res, next));
router.post('/import/bitrix24', managementRoles, (req, res, next) => container.resolve<LeadController>('LeadController').importFromBitrix24(req, res, next));
router.post('/enrich-batch', managementRoles, (req, res, next) => container.resolve<LeadController>('LeadController').enrichBatch(req, res, next));
router.get('/:id', (req, res, next) => container.resolve<LeadController>('LeadController').getLeadById(req, res, next));
router.post('/', writeRoles, validateRequest(leadSchema), (req, res, next) => container.resolve<LeadController>('LeadController').createLead(req, res, next));
router.put('/:id', writeRoles, ownLeadOnly, validateRequest(leadSchema.partial()), (req, res, next) => container.resolve<LeadController>('LeadController').updateLead(req, res, next));

// Apenas ADMIN e GESTOR podem deletar leads (restrição pré-existente, não afetada pela posse do
// lead — excluir é mais sensível do que editar, mantido restrito à gestão).
router.delete('/:id', managementRoles, (req, res, next) => container.resolve<LeadController>('LeadController').deleteLead(req, res, next));

// Reenriquece um lead já prospectado
router.post('/:id/enrich', writeRoles, ownLeadOnly, (req, res, next) => container.resolve<LeadController>('LeadController').enrichLead(req, res, next));

export const leadRoutes = router;
