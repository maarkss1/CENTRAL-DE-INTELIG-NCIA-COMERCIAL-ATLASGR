import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockEnv: { PLATFORM_OPERATOR_TOKEN?: string; NODE_ENV: string } = {
    PLATFORM_OPERATOR_TOKEN: undefined,
    NODE_ENV: 'test',
};

vi.mock('@/config/env', () => ({ env: mockEnv }));

const { requirePlatformOperator } = await import('@/shared/middlewares/requirePlatformOperator');

function buildReqRes(opts: { header?: string; query?: string; cookie?: string } = {}) {
    const req: any = {
        headers: {
            ...(opts.header ? { 'x-platform-operator-token': opts.header } : {}),
            ...(opts.cookie ? { cookie: `platform_operator_token=${opts.cookie}` } : {}),
        },
        query: opts.query ? { operator_token: opts.query } : {},
    };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn(), cookie: vi.fn() };
    const next = vi.fn();
    return { req, res, next };
}

describe('requirePlatformOperator (SEC-001/SEC-002)', () => {
    beforeEach(() => {
        mockEnv.PLATFORM_OPERATOR_TOKEN = undefined;
        mockEnv.NODE_ENV = 'test';
        vi.clearAllMocks();
    });

    it('sem PLATFORM_OPERATOR_TOKEN configurado: nega por padrão (fail-closed), mesmo sem tentar nenhum token', () => {
        const { req, res, next } = buildReqRes();

        requirePlatformOperator(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(503);
    });

    it('token configurado, nenhum apresentado: 403', () => {
        mockEnv.PLATFORM_OPERATOR_TOKEN = 'super-secret-operator-token-value';
        const { req, res, next } = buildReqRes();

        requirePlatformOperator(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
    });

    it('token errado no header: 403 — não vaza se chegou perto de acertar', () => {
        mockEnv.PLATFORM_OPERATOR_TOKEN = 'super-secret-operator-token-value';
        const { req, res, next } = buildReqRes({ header: 'super-secret-operator-token-VALUX' });

        requirePlatformOperator(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
    });

    it('token correto via header: passa e seta cookie de conveniência', () => {
        mockEnv.PLATFORM_OPERATOR_TOKEN = 'super-secret-operator-token-value';
        const { req, res, next } = buildReqRes({ header: 'super-secret-operator-token-value' });

        requirePlatformOperator(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
        expect(res.cookie).toHaveBeenCalledWith(
            'platform_operator_token',
            'super-secret-operator-token-value',
            expect.objectContaining({ httpOnly: true, sameSite: 'strict' })
        );
    });

    it('token correto via query param: passa (ex.: primeira navegação a partir de um link com token)', () => {
        mockEnv.PLATFORM_OPERATOR_TOKEN = 'super-secret-operator-token-value';
        const { req, res, next } = buildReqRes({ query: 'super-secret-operator-token-value' });

        requirePlatformOperator(req, res, next);

        expect(next).toHaveBeenCalled();
    });

    it('token correto via cookie já setado numa requisição anterior: passa e NÃO reseta o cookie', () => {
        mockEnv.PLATFORM_OPERATOR_TOKEN = 'super-secret-operator-token-value';
        const { req, res, next } = buildReqRes({ cookie: 'super-secret-operator-token-value' });

        requirePlatformOperator(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.cookie).not.toHaveBeenCalled();
    });

    it('em produção, o cookie de conveniência é setado com secure:true', () => {
        mockEnv.PLATFORM_OPERATOR_TOKEN = 'super-secret-operator-token-value';
        mockEnv.NODE_ENV = 'production';
        const { req, res, next } = buildReqRes({ header: 'super-secret-operator-token-value' });

        requirePlatformOperator(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.cookie).toHaveBeenCalledWith(
            'platform_operator_token',
            'super-secret-operator-token-value',
            expect.objectContaining({ secure: true })
        );
    });
});
