import { Router } from 'express';
import { container } from '../../../../shared/di/container.js';
import { ObjectionMatrixController } from '../presentation/ObjectionMatrixController.js';
import { validateRequest } from '../../../../shared/middlewares/validateRequest.js';
import { requireRole } from '../../../../shared/middlewares/requireRole.js';
import { objectionMatrixItemSchema } from '../../playbook.schema.js';

const router = Router();
const writeRoles = requireRole(['ADMIN', 'GESTOR', 'CLOSER', 'SDR']);

router.get('/', (req, res, next) =>
  container.resolve<ObjectionMatrixController>('ObjectionMatrixController').list(req, res, next),
);

router.post('/', writeRoles, validateRequest(objectionMatrixItemSchema), (req, res, next) =>
  container.resolve<ObjectionMatrixController>('ObjectionMatrixController').create(req, res, next),
);

router.put(
  '/:id',
  writeRoles,
  validateRequest(objectionMatrixItemSchema.partial()),
  (req, res, next) =>
    container
      .resolve<ObjectionMatrixController>('ObjectionMatrixController')
      .update(req, res, next),
);

// Apenas ADMIN e GESTOR podem excluir itens da matriz — mesma restrição de contacts.delete.
router.delete('/:id', requireRole(['ADMIN', 'GESTOR']), (req, res, next) =>
  container.resolve<ObjectionMatrixController>('ObjectionMatrixController').remove(req, res, next),
);

export const objectionMatrixRoutes = router;
