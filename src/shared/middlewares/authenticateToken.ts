import { Request, Response, NextFunction } from 'express';
import { auth } from '../../lib/auth.js';
import { logger } from '../../lib/logger.js';

export interface AuthUser {
    id: string;
    email: string;
    role: string;
    organizationId: string;
}

export interface AuthRequest extends Request {
    user: AuthUser;
    db?: any; // Prisma Client isolado por Tenant
}

import { requestContext } from '../../lib/async-context.js';

export const authenticateToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const session = await auth.api.getSession({
            headers: req.headers as unknown as Headers
        });

        if (!session || !session.user) {
            res.status(401).json({ success: false, error: 'Access denied. Authentication required.' });
            return;
        }

        const user = session.user as unknown as { id: string, email: string, role: string, organizationId: string };

        (req as AuthRequest).user = {
            id: user.id,
            email: user.email,
            role: user.role || 'GUEST',
            organizationId: user.organizationId,
        };

        requestContext.run({ tenantId: user.organizationId, userId: user.id, role: user.role }, () => {
            next();
        });
    } catch (err) {
        logger.error({ err }, 'Authentication middleware error');
        res.status(401).json({ success: false, error: 'Invalid session.' });
    }
};
