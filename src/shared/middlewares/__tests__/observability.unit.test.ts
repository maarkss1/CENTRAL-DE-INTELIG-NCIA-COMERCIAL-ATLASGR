import { describe, it, expect, vi, beforeEach } from 'vitest';
import { observabilityMiddleware } from '../observability';
import { Request, Response } from 'express';
import { trace } from '@opentelemetry/api';

vi.mock('@opentelemetry/api', () => ({
    trace: {
        getSpan: vi.fn()
    },
    context: {
        active: vi.fn()
    }
}));

describe('Observability Middleware', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should inject request, correlation, trace, and span IDs', () => {
        const req = {
            headers: {},
            method: 'GET',
            url: '/test',
            user: { id: 'u1', organizationId: 't1' }
        } as unknown as Request;

        const res = {
            setHeader: vi.fn()
        } as unknown as Response;

        const next = vi.fn();

        const mockSpan = {
            spanContext: () => ({ traceId: 'test-trace', spanId: 'test-span' }),
            setAttribute: vi.fn()
        };
        vi.mocked(trace.getSpan).mockReturnValue(mockSpan as unknown);

        observabilityMiddleware(req, res, next);

        expect(res.setHeader).toHaveBeenCalledWith('x-request-id', expect.any(String));
        expect(res.setHeader).toHaveBeenCalledWith('x-correlation-id', expect.any(String));
        expect(mockSpan.setAttribute).toHaveBeenCalledWith('http.request_id', expect.any(String));
        expect(mockSpan.setAttribute).toHaveBeenCalledWith('user.id', 'u1');
        expect(mockSpan.setAttribute).toHaveBeenCalledWith('tenant.id', 't1');
        expect((req as unknown).observability.traceId).toBe('test-trace');
        expect(next).toHaveBeenCalled();
    });
});
