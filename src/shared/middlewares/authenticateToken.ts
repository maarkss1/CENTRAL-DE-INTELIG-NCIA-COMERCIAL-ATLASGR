import { Request, Response, NextFunction } from 'express';
import { auth } from '../../lib/auth.js';
import { logger } from '../../lib/logger.js';
import { fromNodeHeaders } from 'better-auth/node';
import { isAuthorizedLoginEmail } from '../../config/access-policy.js';
import type { getTenantPrisma } from '../../lib/tenant-prisma.js';
import { requestContext } from '../../lib/async-context.js';

export interface AuthUser {
    id: string;
    email: string;
    role: string;
    organizationId: string;
}

export interface AuthRequest extends Request {
    user: AuthUser;
    db?: ReturnType<typeof getTenantPrisma>;
}

export const authenticateToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        // Assim como as rotas /api/auth/* (server.ts), esta busca de sessão roda antes de
        // sabermos o tenant do usuário — getSession() precisa localizar Session/User por conta
        // própria, e essas tabelas têm FORCE ROW LEVEL SECURITY. Sem o bypass aqui, toda requisição
        // com sessão seria rejeitada como sessão inválida sob RLS.
        const session = await requestContext.run({ bypassRls: true }, () =>
            auth.api.getSession({
                headers: fromNodeHeaders(req.headers)
            })
        );

        if (!session?.user) {
            res.status(401).json({ success: false, error: 'Autenticação necessária.' });
            return;
        }

        const user = session.user as unknown as { id: string, email: string, role: string, organizationId: string };

        if (!isAuthorizedLoginEmail(user.email)) {
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
