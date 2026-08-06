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
        // com sessão seria rejeitada como sessão inválida sob RLS. Se não houver sessão, o
        // middleware cria uma identidade pública abaixo para remover a necessidade de cadastro/login.
        const session = await requestContext.run({ bypassRls: true }, () =>
            auth.api.getSession({
                headers: fromNodeHeaders(req.headers)
            })
        );

        let user: { id: string, email: string, role?: string, organizationId?: string };
        let isPublicAccess = false;
        if (!session || !session.user) {
            const { prisma } = await import('../../lib/prisma.js');
            const org = await requestContext.run({ bypassRls: true }, async () => {
                const existingOrg = await prisma.organization.findFirst();
                if (existingOrg) return existingOrg;

                return prisma.organization.create({
                    data: {
                        name: 'Atlas Public Org'
                    }
                });
            });

            user = {
                id: 'public-access-user',
                email: 'visitante@atlasgr.com.br',
                role: 'SUPER_ADMIN',
                organizationId: org.id
            };
            isPublicAccess = true;
        } else {
            user = session.user as unknown as { id: string, email: string, role: string, organizationId: string };
        }

        if (!isPublicAccess && !isAuthorizedLoginEmail(user.email)) {
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
