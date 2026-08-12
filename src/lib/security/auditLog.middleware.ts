import { Request, Response, NextFunction } from 'express';
import { AuditService } from '../audit/audit.service.js';

export function auditAccessMiddleware(entity: string) {
    return (req: Request, res: Response, next: NextFunction) => {
        const actorId = (req as any).user?.id || 'anonymous';
        const tenantId = (req as any).user?.organizationId || req.headers['x-organization-id'] as string;
        const ipAddress = req.ip || req.socket.remoteAddress;

        // Ao finalizar a requisição, gravamos o log de auditoria
        res.on('finish', () => {
            if (res.statusCode < 400) {
                AuditService.log({
                    action: req.method === 'GET' ? 'EXPORT' : (req.method === 'DELETE' ? 'DELETE' : 'UPDATE'),
                    entity,
                    actorId,
                    tenantId,
                    ipAddress,
                    device: req.headers['user-agent']
                }).catch(() => {});
            }
        });

        next();
    };
}
