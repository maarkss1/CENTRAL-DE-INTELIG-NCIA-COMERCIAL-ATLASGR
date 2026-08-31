import type { Request, Response, NextFunction } from 'express';

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    // TODO: Add logic for checking Casdoor JSON Web Tokens (using CASDOOR_ENDPOINT).
    next();
};
