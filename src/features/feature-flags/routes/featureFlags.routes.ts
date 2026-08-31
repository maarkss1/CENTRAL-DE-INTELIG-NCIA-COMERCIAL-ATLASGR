import { Router } from 'express';
import { requireRole } from '../../../shared/middlewares/requireRole.js';
import { container } from '../../../shared/di/container.js';
import type { FeatureFlagsController } from '../presentation/FeatureFlagsController.js';

export const featureFlagsRouter = Router();

featureFlagsRouter.get('/', (req, res, next) =>
  container
    .resolve<FeatureFlagsController>('FeatureFlagsController')
    .listResolved(req, res, next),
);

featureFlagsRouter.put('/:key', requireRole(['ADMIN']), (req, res, next) =>
  container.resolve<FeatureFlagsController>('FeatureFlagsController').setOverride(req, res, next),
);

featureFlagsRouter.delete('/:key', requireRole(['ADMIN']), (req, res, next) =>
  container
    .resolve<FeatureFlagsController>('FeatureFlagsController')
    .clearOverride(req, res, next),
);
