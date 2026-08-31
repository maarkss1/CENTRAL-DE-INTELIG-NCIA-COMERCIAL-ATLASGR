import type { Request, Response, NextFunction } from 'express';
import type { ZodTypeAny } from 'zod';

export const validateRequest = (schema: ZodTypeAny) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = await schema.parseAsync(req.body);

      next();
    } catch (error) {
      next(error);
    }
  };
};
