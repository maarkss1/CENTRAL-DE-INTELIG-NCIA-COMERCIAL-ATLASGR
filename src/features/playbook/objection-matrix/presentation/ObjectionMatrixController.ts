import type { Request, Response, NextFunction } from 'express';
import type { ObjectionMatrixUseCases } from '../application/ObjectionMatrixUseCases';
import type { AuthRequest } from '../../../../shared/middlewares/authenticateToken';

export class ObjectionMatrixController {
  constructor(private useCases: ObjectionMatrixUseCases) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId: orgId } = (req as AuthRequest).user;
      const brand = typeof req.query.brand === 'string' ? req.query.brand : undefined;
      const result = await this.useCases.findItems(orgId, brand);
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
      const item = await this.useCases.updateItem(orgId, req.params.id, req.body);
      res.json({ success: true, data: item });
    } catch (error) {
      next(error);
    }
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId: orgId } = (req as AuthRequest).user;
      await this.useCases.deleteItem(orgId, req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };
}
