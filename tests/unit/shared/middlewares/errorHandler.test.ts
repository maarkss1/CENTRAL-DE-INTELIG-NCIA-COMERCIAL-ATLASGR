import { describe, it, expect, vi } from 'vitest';
import { errorHandler, AppError } from '@/shared/middlewares/errorHandler';
import { IObservabilityRequest } from '@/shared/middlewares/observability';
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';

/**
 * Constrói um par req/res mockado que se comporta como o pipeline real:
 * `observabilityMiddleware` já rodou, gravou `req.observability.requestId` e chamou
 * `res.setHeader('x-request-id', ...)` com o mesmo valor (ver src/shared/middlewares/
 * observability.ts:41). `res.getHeader` lê de um Map local para simular o header já setado
 * na resposta antes do errorHandler rodar — não um segundo mecanismo de id.
 */
function buildReqRes(requestId = 'req-test-123') {
    const headers = new Map<string, string>();
    headers.set('x-request-id', requestId);

    const req = {
        headers: { 'x-request-id': requestId },
        observability: {
            requestId,
            correlationId: 'corr-test-123',
            traceId: 'none',
            spanId: 'none',
        },
    } as unknown as Request & IObservabilityRequest;

    const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        getHeader: vi.fn((name: string) => headers.get(name.toLowerCase())),
        setHeader: vi.fn((name: string, value: string) => { headers.set(name.toLowerCase(), value); }),
    } as unknown as Response;

    const next = vi.fn() as NextFunction;

    return { req, res, next, headers };
}

describe('errorHandler Middleware', () => {
    it('should handle ZodError and return 400 with a stable non-retryable validation code', () => {
        const error = new ZodError([{
            code: 'custom',
            path: ['name'],
            message: 'Nome é obrigatório',
        }]);

        const { req, res, next } = buildReqRes('req-zod-1');

        errorHandler(error, req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            success: false,
            error: 'Erro de Validação',
            code: 'VALIDATION_ERROR',
            retryable: false,
            requestId: 'req-zod-1',
            details: error.issues,
        });
    });

    it('should handle general Error and return 500 with a retryable internal-error code', () => {
        const error = new Error('Test Error');

        const { req, res, next } = buildReqRes('req-500-1');

        errorHandler(error, req, res, next);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            success: false,
            error: 'Test Error',
            code: 'INTERNAL_ERROR',
            retryable: true,
            requestId: 'req-500-1',
        });
    });

    it('should keep the legacy success/error fields present (additive contract change, not breaking)', () => {
        const error = new Error('Legacy shape check');
        const { req, res, next } = buildReqRes();

        errorHandler(error, req, res, next);

        const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(body).toHaveProperty('success', false);
        expect(body).toHaveProperty('error', 'Legacy shape check');
        // Campos novos são estritamente aditivos: nenhum campo antigo foi removido.
        expect(body).toHaveProperty('code');
        expect(body).toHaveProperty('retryable');
        expect(body).toHaveProperty('requestId');
    });

    it('body.requestId matches the x-request-id header already set on the same response', () => {
        const error = new AppError('Falha de negócio', 409);
        const { req, res, next, headers } = buildReqRes('req-match-1');

        errorHandler(error, req, res, next);

        const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(body.requestId).toBe('req-match-1');
        // Mesmo valor que `observabilityMiddleware` já gravou como header da resposta (ver
        // buildReqRes acima) — o corpo nunca diverge do header da mesma resposta.
        expect(body.requestId).toBe(headers.get('x-request-id'));
    });

    it('falls back to reading the already-set x-request-id response header when req.observability is absent', () => {
        const error = new AppError('Falha de negócio', 409);
        const headers = new Map<string, string>();
        headers.set('x-request-id', 'req-header-only-1');
        const req = { headers: {} } as unknown as Request;
        const res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn(),
            getHeader: vi.fn((name: string) => headers.get(name.toLowerCase())),
            setHeader: vi.fn((name: string, value: string) => { headers.set(name.toLowerCase(), value); }),
        } as unknown as Response;
        const next = vi.fn() as NextFunction;

        errorHandler(error, req, res, next);

        expect(res.getHeader).toHaveBeenCalledWith('x-request-id');
        const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(body.requestId).toBe('req-header-only-1');
    });

    it('falls back gracefully when observability never ran on this request (no second id mechanism)', () => {
        const error = new Error('Sem observability');
        const req = { headers: {} } as unknown as Request;
        const headers = new Map<string, string>();
        const res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn(),
            getHeader: vi.fn((name: string) => headers.get(name.toLowerCase())),
            setHeader: vi.fn((name: string, value: string) => { headers.set(name.toLowerCase(), value); }),
        } as unknown as Response;
        const next = vi.fn() as NextFunction;

        errorHandler(error, req, res, next);

        const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(body.requestId).toBeUndefined();
        expect(body.success).toBe(false);
    });

    describe('retryable rule: 5xx and timeouts are retryable, validation/auth/conflict 4xx are not', () => {
        const cases: Array<{ status: number; code: string; retryable: boolean }> = [
            { status: 400, code: 'VALIDATION_ERROR', retryable: false },
            { status: 401, code: 'UNAUTHORIZED', retryable: false },
            { status: 403, code: 'FORBIDDEN', retryable: false },
            { status: 404, code: 'NOT_FOUND', retryable: false },
            { status: 409, code: 'CONFLICT', retryable: false },
            { status: 422, code: 'UNPROCESSABLE_ENTITY', retryable: false },
            { status: 429, code: 'RATE_LIMITED', retryable: true },
            { status: 500, code: 'INTERNAL_ERROR', retryable: true },
            { status: 502, code: 'BAD_GATEWAY', retryable: true },
            { status: 503, code: 'SERVICE_UNAVAILABLE', retryable: true },
            { status: 504, code: 'TIMEOUT', retryable: true },
        ];

        for (const { status, code, retryable } of cases) {
            it(`AppError(${status}) -> code ${code}, retryable ${retryable}`, () => {
                const error = new AppError(`erro ${status}`, status);
                const { req, res, next } = buildReqRes();

                errorHandler(error, req, res, next);

                expect(res.status).toHaveBeenCalledWith(status);
                const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
                expect(body.code).toBe(code);
                expect(body.retryable).toBe(retryable);
            });
        }
    });

    it('maps Prisma P2002 (unique constraint) to 409 CONFLICT, not retryable', () => {
        const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
            code: 'P2002',
            clientVersion: '5.0.0',
        });
        const { req, res, next } = buildReqRes('req-p2002-1');

        errorHandler(error, req, res, next);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith({
            success: false,
            error: 'Conflito de Dados: Este registro já existe.',
            code: 'CONFLICT',
            retryable: false,
            requestId: 'req-p2002-1',
        });
    });

    it('maps Prisma P2025 (record not found) to 404 NOT_FOUND, not retryable', () => {
        const error = new Prisma.PrismaClientKnownRequestError('Record not found', {
            code: 'P2025',
            clientVersion: '5.0.0',
        });
        const { req, res, next } = buildReqRes('req-p2025-1');

        errorHandler(error, req, res, next);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({
            success: false,
            error: 'Registro não encontrado.',
            code: 'NOT_FOUND',
            retryable: false,
            requestId: 'req-p2025-1',
        });
    });
});
