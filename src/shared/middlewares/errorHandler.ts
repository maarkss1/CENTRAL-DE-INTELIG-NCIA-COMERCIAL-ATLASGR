import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { logger } from '../../lib/logger.js';
import { env } from '../../config/env.js';
import { IObservabilityRequest } from './observability.js';

/**
 * Taxonomia estável de `code` de erro, exposta no corpo da resposta (ver checklist de contratos
 * do produto — Agente 18). Deriva do status HTTP e, quando o tipo de erro já lançado no código
 * permite mais precisão (ZodError, `AppError`, `Prisma.PrismaClientKnownRequestError`), do próprio
 * tipo. Propositalmente pequena: cobre os status HTTP que este backend já lança hoje via
 * `AppError`/rotas (400, 401, 403, 404, 405, 409, 410, 415, 422, 429, 500, 502, 503, 504) — não é
 * uma taxonomia inventada do zero, e novos códigos só devem ser adicionados quando um novo status
 * HTTP passar a ser lançado de verdade.
 */
export type ApiErrorCode =
    | 'VALIDATION_ERROR'
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'METHOD_NOT_ALLOWED'
    | 'CONFLICT'
    | 'GONE'
    | 'UNSUPPORTED_MEDIA_TYPE'
    | 'UNPROCESSABLE_ENTITY'
    | 'RATE_LIMITED'
    | 'INTERNAL_ERROR'
    | 'BAD_GATEWAY'
    | 'SERVICE_UNAVAILABLE'
    | 'TIMEOUT'
    | 'BAD_REQUEST';

export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
    details?: unknown;
    /** Código estável de erro, para o consumidor decidir programaticamente sem parsear `error`. */
    code?: ApiErrorCode;
    /** Mesmo id de `x-request-id` (ver `observability.ts`) — nunca um segundo mecanismo de id. */
    requestId?: string;
    /** Regra: 5xx e timeouts (408/504) são retentáveis; 4xx de validação/autorização/conflito não são. */
    retryable?: boolean;
}

export class AppError extends Error {
    public readonly statusCode: number;
    public readonly details?: unknown;

    constructor(message: string, statusCode: number = 400, details?: unknown) {
        super(message);
        this.statusCode = statusCode;
        this.details = details;
        Object.setPrototypeOf(this, new.target.prototype); // restore prototype chain
    }
}

/** Mapeia status HTTP -> `code` estável. Ver o comentário de `ApiErrorCode` acima. */
function codeForStatus(status: number): ApiErrorCode {
    switch (status) {
        case 400: return 'VALIDATION_ERROR';
        case 401: return 'UNAUTHORIZED';
        case 403: return 'FORBIDDEN';
        case 404: return 'NOT_FOUND';
        case 405: return 'METHOD_NOT_ALLOWED';
        case 409: return 'CONFLICT';
        case 410: return 'GONE';
        case 415: return 'UNSUPPORTED_MEDIA_TYPE';
        case 422: return 'UNPROCESSABLE_ENTITY';
        case 429: return 'RATE_LIMITED';
        case 502: return 'BAD_GATEWAY';
        case 503: return 'SERVICE_UNAVAILABLE';
        case 408:
        case 504:
            return 'TIMEOUT';
        default:
            return status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST';
    }
}

/**
 * Regra de `retryable` (checklist de contratos do produto): 5xx é falha do servidor/upstream —
 * repetir a mesma requisição pode funcionar (transiente). 408/504 são timeout — também vale
 * repetir. 429 é limite de taxa — repetir vale, só que com backoff (o cliente decide o tempo).
 * Qualquer outro 4xx (validação, autenticação, autorização, conflito, não encontrado) é erro do
 * pedido em si: repetir sem mudar o request só reproduz o mesmo erro.
 */
function isRetryableStatus(status: number): boolean {
    if (status === 408 || status === 429) return true;
    return status >= 500;
}

/** Reaproveita o `x-request-id` já gerado por `observabilityMiddleware` — nunca gera um segundo id. */
function resolveRequestId(req: Request, res: Response): string | undefined {
    const fromObservability = (req as IObservabilityRequest).observability?.requestId;
    if (typeof fromObservability === 'string' && fromObservability) return fromObservability;
    if (Array.isArray(fromObservability) && fromObservability[0]) return fromObservability[0];

    const headerValue = res.getHeader('x-request-id');
    if (typeof headerValue === 'string' && headerValue) return headerValue;

    const rawReqHeader = req.headers['x-request-id'];
    if (typeof rawReqHeader === 'string' && rawReqHeader) return rawReqHeader;
    if (Array.isArray(rawReqHeader) && rawReqHeader[0]) return rawReqHeader[0];

    return undefined;
}

function sendError(
    req: Request,
    res: Response,
    status: number,
    error: string,
    options?: { code?: ApiErrorCode; details?: unknown }
): void {
    const code = options?.code ?? codeForStatus(status);
    const body: ApiResponse = {
        success: false,
        error,
        code,
        retryable: isRetryableStatus(status),
        requestId: resolveRequestId(req, res),
    };
    if (options?.details !== undefined) body.details = options.details;
    res.status(status).json(body);
}

export const errorHandler = (err: Error & { statusCode?: number; details?: unknown }, req: Request, res: Response, _next: NextFunction): void => {
    logger.error({ err, status: err.statusCode }, 'Global error handler');

    if (err instanceof ZodError) {
        sendError(req, res, 400, 'Erro de Validação', { code: 'VALIDATION_ERROR', details: err.issues });
        return;
    }

    if (err instanceof AppError) {
        sendError(req, res, err.statusCode, err.message, { details: err.details });
        return;
    }

    if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002') {
            sendError(req, res, 409, 'Conflito de Dados: Este registro já existe.', { code: 'CONFLICT' });
            return;
        }
        if (err.code === 'P2025') {
            sendError(req, res, 404, 'Registro não encontrado.', { code: 'NOT_FOUND' });
            return;
        }
    }

    const status = err.statusCode ?? 500;
    const errorMessage = env.NODE_ENV === 'production' && status === 500
        ? 'Erro Interno do Servidor'
        : (err.message || 'Erro Interno do Servidor');

    sendError(req, res, status, errorMessage);
};
