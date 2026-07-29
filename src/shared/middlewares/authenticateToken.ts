import { Request, Response, NextFunction } from 'express';
import { auth } from '../../lib/auth.js';
import { logger } from '../../lib/logger.js';
import { fromNodeHeaders } from 'better-auth/node';
import { env } from '../../config/env.js';
import { isAuthorizedLoginEmail } from '../../config/access-policy.js';

export interface AuthUser {
    id: string;
    email: string;
    role: string;
    organizationId: string;
}

export interface AuthRequest extends Request {
    user: AuthUser;
    db?: unknown; // Prisma Client isolado por Tenant
}

import { requestContext } from '../../lib/async-context.js';

export const authenticateToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const session = await auth.api.getSession({
            headers: fromNodeHeaders(req.headers)
        });

        let user: { id: string, email: string, role?: string, organizationId?: string };
        let isDevelopmentBypass = false;
        if (!session || !session.user) {
            if (env.NODE_ENV !== 'development' || !env.ALLOW_DEV_AUTH_BYPASS) {
                res.status(401).json({ success: false, error: 'Autenticação necessária.' });
                return;
            }
            const { prisma } = await import('../../lib/prisma.js');
            let org = await prisma.organization.findFirst();
            if (!org) {
                org = await prisma.organization.create({
                    data: {
                        name: 'Atlas Default Org'
                    }
                });
            }
            user = {
                id: 'dev-bypass-user',
                email: 'admin@prospector.com',
                role: 'ADMIN',
                organizationId: org.id
            };
            isDevelopmentBypass = true;
        } else {
            user = session.user as unknown as { id: string, email: string, role: string, organizationId: string };
        }

        if (!isDevelopmentBypass && !isAuthorizedLoginEmail(user.email)) {
            res.status(403).json({ success: false, error: 'Acesso restrito ao e-mail autorizado.' });
            return;
        }

        if (!user.organizationId) {
            res.status(403).json({ success: false, error: 'Usuário sem organização vinculada.' });
            return;
        }

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
