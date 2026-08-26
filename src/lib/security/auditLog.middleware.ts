import { Request, Response, NextFunction } from 'express';
import { AuditService } from '../audit/audit.service.js';
import { AuthRequest } from '../../shared/middlewares/authenticateToken.js';
import { requestContext } from '../async-context.js';
import { logger } from '../logger.js';

export function auditAccessMiddleware(entity: string) {
    return (req: Request, res: Response, next: NextFunction) => {
        const actorId = (req as AuthRequest).user?.id || 'anonymous';
        // tenantId vem exclusivamente do usuário autenticado — nunca de um header controlado pelo
        // cliente. Um fallback para `x-organization-id` faria o próprio log de auditoria mentir
        // sobre de qual tenant é o acesso registrado (e, pior, mascararia um acesso indevido como
        // se fosse legítimo daquele tenant forjado).
        const tenantId = (req as AuthRequest).user?.organizationId;
        const ipAddress = req.ip || req.socket.remoteAddress;

        // Ao finalizar a requisição, gravamos o log de auditoria. AuditLog tem FORCE ROW LEVEL
        // SECURITY (WITH CHECK exige app.current_tenant_id = tenantId, sem bypass — ver migration
        // 20260825120000_scope_rls_bypass_to_bootstrap_allowlist) — a extensão Prisma que seta essa
        // variável de sessão lê `requestContext.getStore()` (AsyncLocalStorage). O evento 'finish'
        // do response dispara depois de toda a cadeia síncrona de middlewares já ter retornado
        // (achado real ao validar esta rota via teste de integração contra Postgres de verdade,
        // roadmap-v2, resolução do handoff roadmap-v2-transversais/
        // 15-para-00-auditaccessmiddleware-nao-utilizado.md): em vez de depender da propagação
        // implícita de contexto através do listener do EventEmitter, reabre o contexto explicitamente
        // aqui — garante o INSERT sob RLS correto não importa como/quando 'finish' dispara.
        logger.info({ entity, tenantId, path: req.path }, '[DEBUG auditAccessMiddleware] mounted, registering finish listener');
        res.on('finish', () => {
            logger.info({ entity, tenantId, statusCode: res.statusCode }, '[DEBUG auditAccessMiddleware] finish fired');
            if (res.statusCode < 400) {
                requestContext.run({ tenantId }, () => {
                    logger.info({ entity, tenantId, storeSeen: requestContext.getStore() }, '[DEBUG auditAccessMiddleware] calling AuditService.log');
                    AuditService.log({
                        action: req.method === 'GET' ? 'EXPORT' : (req.method === 'DELETE' ? 'DELETE' : 'UPDATE'),
                        entity,
                        actorId,
                        tenantId,
                        ipAddress,
                        device: req.headers['user-agent']
                    }).then(() => {
                        logger.info({ entity, tenantId }, '[DEBUG auditAccessMiddleware] AuditService.log resolved');
                    }).catch((err) => {
                        logger.error({ entity, tenantId, err }, '[DEBUG auditAccessMiddleware] AuditService.log threw');
                    });
                });
            }
        });

        next();
    };
}
