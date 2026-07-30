import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { trace, context } from '@opentelemetry/api';
import { logger } from '../../lib/logger.js';
import { AuthRequest } from './authenticateToken.js';

export const observabilityMiddleware = (req: Request, res: Response, next: NextFunction): void => {
    const requestId = req.headers['x-request-id'] || uuidv4();
    const correlationId = req.headers['x-correlation-id'] || uuidv4();

    // Set response headers
    res.setHeader('x-request-id', requestId as string);
    res.setHeader('x-correlation-id', correlationId as string);

    // Get current span if any
    const span = trace.getSpan(context.active());
    const traceId = span ? span.spanContext().traceId : 'none';
    const spanId = span ? span.spanContext().spanId : 'none';

    // Extract user info if authenticated (auth middleware runs before this ideally, but sometimes after)
    const authReq = req as AuthRequest;
    const userId = authReq.user?.id || 'anonymous';
    const tenantId = authReq.user?.organizationId || 'none';

    if (span) {
        span.setAttribute('http.request_id', requestId as string);
        span.setAttribute('http.correlation_id', correlationId as string);
        span.setAttribute('user.id', userId);
        span.setAttribute('tenant.id', tenantId);
    }

    // Attach contextual info to req for deeper logging if needed
    (req as unknown).observability = {
        requestId,
        correlationId,
        traceId,
        spanId
    };

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

    next();
};
