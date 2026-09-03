import type { Request, Response, NextFunction } from 'express';
import type { QualificationMatrixUseCases } from '../application/QualificationMatrixUseCases';
import type { AuthRequest } from '../../../../shared/middlewares/authenticateToken';
import { routeParam } from '../../../../shared/http/routeParams';

export class QualificationMatrixController {
  constructor(private useCases: QualificationMatrixUseCases) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId: orgId } = (req as AuthRequest).user;
      const brand = typeof req.query.brand === 'string' ? req.query.brand : undefined;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 200;
      const result = await this.useCases.findItems(orgId, brand, page, limit);
      res.json({ success: true, data: result.data, meta: result.meta });
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId: orgId } = (req as AuthRequest).user;
      const item = await this.useCases.createItem(orgId, req.body);
      res.status(201).json({ success: true, data: item });
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId: orgId } = (req as AuthRequest).user;
      const item = await this.useCases.updateItem(orgId, routeParam(req.params.id, 'id'), req.body);
      res.json({ success: true, data: item });
    } catch (error) {
      next(error);
    }
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId: orgId } = (req as AuthRequest).user;
      await this.useCases.deleteItem(orgId, routeParam(req.params.id, 'id'));
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };
}
