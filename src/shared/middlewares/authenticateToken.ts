import { Request, Response, NextFunction } from 'express';
import { auth } from '../../lib/auth.js';
import { logger } from '../../lib/logger.js';
import { fromNodeHeaders } from 'better-auth/node';
import { env } from '../../config/env.js';
import { isAuthorizedLoginEmail } from '../../config/access-policy.js';
import type { getTenantPrisma } from '../../lib/tenant-prisma.js';

export interface AuthUser {
    id: string;
    email: string;
    role: string;
    organizationId: string;
}

export interface AuthRequest extends Request {
    user: AuthUser;
    // Prisma Client isolado por Tenant (ver getTenantPrisma) — tipado como `unknown` antes fazia
    // `authRequest.db || prisma` cair no truque de narrowing do TS pra "{}", quebrando o acesso a
    // qualquer model (ex.: prisma.aIPendingAction) em quem usa esse fallback.
    db?: ReturnType<typeof getTenantPrisma>;
}

import { requestContext } from '../../lib/async-context.js';

export const authenticateToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        // getSession ainda não sabe a qual tenant este request pertence — é justamente o que essa
        // consulta descobre, lendo session/user por token, não por organizationId. Roda com o mesmo
        // bypass explícito usado nas rotas de auth (ver server.ts) para não ser bloqueada pelo RLS.
        const session = await requestContext.run({ bypassRls: true }, () => auth.api.getSession({
            headers: fromNodeHeaders(req.headers)
        }));

        let user: { id: string, email: string, role?: string, organizationId?: string };
        let isDevelopmentBypass = false;
        if (!session || !session.user) {
            if (env.NODE_ENV !== 'development' || !env.ALLOW_DEV_AUTH_BYPASS) {
                res.status(401).json({ success: false, error: 'Autenticação necessária.' });
                return;
            }
            const { prisma } = await import('../../lib/prisma.js');
            let org = await prisma.organization.findFirst().catch(() => null);
            if (!org) {
                org = await prisma.organization.create({
                    data: {
                        name: 'Atlas Default Org'
                    }
                }).catch(() => null);
            }
            user = {
                id: 'dev-bypass-user',
                email: 'admin@prospector.com',
                role: 'ADMIN',
                organizationId: org?.id || 'dev-default-org'
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
