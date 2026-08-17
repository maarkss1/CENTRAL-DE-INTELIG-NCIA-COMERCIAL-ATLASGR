import { Request, Response, NextFunction } from 'express';
import type { AuthRequest } from './authenticateToken.js';
import { hasRequiredRole } from '../../lib/auth/authorization.js';

/**
 * RBAC middleware — garante que o usuário autenticado possui pelo menos um dos
 * papéis (roles) especificados. Deve ser usado APÓS `authenticateToken`.
 *
 * Fonte canônica da hierarquia de papéis (ADMIN > GESTOR > CLOSER > SDR > VISUALIZADOR):
 * `src/lib/auth/authorization.ts`. Não duplicar a hierarquia aqui — ver comentário lá sobre o
 * sistema de RBAC divergente que existia antes.
 *
 * Exemplo de uso:
 *   router.delete('/:id', authenticateToken, requireRole(['ADMIN', 'GESTOR']), handler)
 */
export function requireRole(allowedRoles: string[]) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const authReq = req as AuthRequest;

        // authenticateToken deve ter sido chamado antes deste middleware
        if (!authReq.user) {
            res.status(401).json({
                success: false,
                error: 'Authentication required.',
            });
            return;
        }

        if (!hasRequiredRole(authReq.user.role, allowedRoles)) {
            res.status(403).json({
                success: false,
                error: `Insufficient permissions. Required: ${allowedRoles.join(' or ')}. Your role: ${authReq.user.role}.`,
            });
            return;
        }

        next();
    };
}
