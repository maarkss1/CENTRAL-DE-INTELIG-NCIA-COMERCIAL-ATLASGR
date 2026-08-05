import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { trace, context } from '@opentelemetry/api';
import { logger } from '../../lib/logger.js';
import { AuthRequest } from './authenticateToken.js';

export interface IObservabilityRequest extends Request {
    observability?: {
        requestId: string | string[];
        correlationId: string | string[];
        traceId: string;
        spanId: string;
    };
}

export const observabilityMiddleware = (req: Request, res: Response, next: NextFunction): void => {
    const rawReqId = req.headers['x-request-id'];
    const rawCorrId = req.headers['x-correlation-id'];
    const requestId = (Array.isArray(rawReqId) ? rawReqId[0] : rawReqId) || uuidv4();
    const correlationId = (Array.isArray(rawCorrId) ? rawCorrId[0] : rawCorrId) || uuidv4();

    // Set response headers
    res.setHeader('x-request-id', requestId);
    res.setHeader('x-correlation-id', correlationId);

    // Get current span if any
    const span = trace.getSpan(context.active());
    const traceId = span ? span.spanContext().traceId : 'none';
    const spanId = span ? span.spanContext().spanId : 'none';

    // Extract user info if authenticated (auth middleware runs before this ideally, but sometimes after)
    const authReq = req as AuthRequest;
    const userId = authReq.user?.id || 'anonymous';
    const tenantId = authReq.user?.organizationId || 'none';

    if (span) {
        span.setAttribute('http.request_id', requestId);
        span.setAttribute('http.correlation_id', correlationId);
        span.setAttribute('user.id', userId);
        span.setAttribute('tenant.id', tenantId);
    }

    // Attach contextual info to req for deeper logging if needed
    (req as IObservabilityRequest).observability = {
        requestId,
        correlationId,
        traceId,
        spanId
    };

    // Ignora logs de rotas de monitoramento frequentes (liveness probes e metrics)
    const isHealthCheck = req.url.startsWith('/health/') || req.url === '/metrics';
    if (!isHealthCheck) {
        logger.info({
            requestId,
            correlationId,
            traceId,
            spanId,
            userId,
            tenantId,
            method: req.method,
            url: req.url
        }, 'Incoming request');
    }

    next();
};
