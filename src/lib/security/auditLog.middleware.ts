import { Request, Response, NextFunction } from 'express';
import { AuditService } from '../audit/audit.service.js';

export function auditAccessMiddleware(entity: string) {
    return (req: Request, res: Response, next: NextFunction) => {
        const actorId = (req as any).user?.id || 'anonymous';
        // tenantId vem exclusivamente do usuário autenticado — nunca de um header controlado pelo
        // cliente. Um fallback para `x-organization-id` faria o próprio log de auditoria mentir
        // sobre de qual tenant é o acesso registrado (e, pior, mascararia um acesso indevido como
        // se fosse legítimo daquele tenant forjado).
        const tenantId = (req as any).user?.organizationId;
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
