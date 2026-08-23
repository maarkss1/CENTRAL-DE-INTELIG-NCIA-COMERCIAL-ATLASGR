import { Router } from 'express';
import { container } from '../../../../shared/di/container.js';
import { QualificationMatrixController } from '../presentation/QualificationMatrixController.js';
import { validateRequest } from '../../../../shared/middlewares/validateRequest.js';
import { requireRole } from '../../../../shared/middlewares/requireRole.js';
import { qualificationMatrixItemSchema } from '../../playbook.schema.js';

const router = Router();
const writeRoles = requireRole(['ADMIN', 'GESTOR', 'CLOSER', 'SDR']);

router.get('/', (req, res, next) =>
    container.resolve<QualificationMatrixController>('QualificationMatrixController').list(req, res, next)
);

router.post('/', writeRoles, validateRequest(qualificationMatrixItemSchema), (req, res, next) =>
    container.resolve<QualificationMatrixController>('QualificationMatrixController').create(req, res, next)
);

router.put('/:id', writeRoles, validateRequest(qualificationMatrixItemSchema.partial()), (req, res, next) =>
    container.resolve<QualificationMatrixController>('QualificationMatrixController').update(req, res, next)
);

// Apenas ADMIN e GESTOR podem excluir itens da matriz — mesma restrição de contacts.delete.
router.delete('/:id', requireRole(['ADMIN', 'GESTOR']), (req, res, next) =>
    container.resolve<QualificationMatrixController>('QualificationMatrixController').remove(req, res, next)
);

export const qualificationMatrixRoutes = router;
