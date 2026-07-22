import { Request, Response, NextFunction } from 'express';
import { AuthorizationService, Permission, Role } from '../../lib/auth/authorization.js';
import { AuthRequest } from './authenticateToken.js';
import { logger } from '../../lib/logger.js';
import { getTenantPrisma } from '../../lib/tenant-prisma.js';

export const requireTenant = (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthRequest;
    if (!authReq.user || !authReq.user.organizationId) {
        logger.warn({ userId: authReq.user?.id }, 'Access denied: Tenant ID missing');
        res.status(403).json({ success: false, error: 'User is not associated with any tenant/organization.' });
        return;
    }
    try {
        authReq.db = getTenantPrisma(authReq.user.organizationId);
        next();
    } catch (err) {
        logger.error({ err }, 'Failed to initialize Tenant Prisma');
        res.status(500).json({ success: false, error: 'Internal Server Error.' });
    }
};

export const requirePermission = (permission: Permission) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        const authReq = req as AuthRequest;
        const role = authReq.user.role as Role;

        if (!AuthorizationService.hasPermission(role, permission)) {
            logger.warn({ userId: authReq.user.id, role, permission }, 'Access denied: Missing required permission');
            res.status(403).json({ success: false, error: 'Forbidden: Insufficient permissions.' });
            return;
        }

        next();
    };
};

export const requireAnyPermission = (permissions: Permission[]) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        const authReq = req as AuthRequest;
        const role = authReq.user.role as Role;

        if (!AuthorizationService.hasAnyPermission(role, permissions)) {
            logger.warn({ userId: authReq.user.id, role, permissions }, 'Access denied: Missing any of the required permissions');
            res.status(403).json({ success: false, error: 'Forbidden: Insufficient permissions.' });
            return;
        }

        next();
    };
};
