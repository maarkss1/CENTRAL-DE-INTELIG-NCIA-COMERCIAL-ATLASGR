import { describe, it, expect, vi } from 'vitest';
import { Request, Response } from 'express';
import { requireRole } from '../requireRole';

function makeRes() {
    return {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
    } as unknown as Response;
}

describe('requireRole middleware', () => {
    it('chama next quando o papel do usuário está na lista permitida', () => {
        const req = { user: { role: 'ADMIN' } } as unknown as Request;
        const res = makeRes();
        const next = vi.fn();

        requireRole(['ADMIN', 'GESTOR'])(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
    });

    it('chama next quando o papel do usuário tem nível maior que o mínimo exigido', () => {
        const req = { user: { role: 'ADMIN' } } as unknown as Request;
        const res = makeRes();
        const next = vi.fn();

        requireRole(['GESTOR'])(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
    });

    it('retorna 403 quando o papel do usuário não satisfaz a lista permitida (role negado)', () => {
        const req = { user: { role: 'VENDEDOR' } } as unknown as Request;
        const res = makeRes();
        const next = vi.fn();

        requireRole(['ADMIN', 'GESTOR'])(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: false }),
        );
        expect(next).not.toHaveBeenCalled();
    });

    it('retorna 403 para papel desconhecido/inexistente na hierarquia', () => {
        const req = { user: { role: 'SUPER_ADMIN' } } as unknown as Request;
        const res = makeRes();
        const next = vi.fn();

        requireRole(['ADMIN'])(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    it('retorna 401 quando não há usuário autenticado na requisição', () => {
        const req = {} as Request;
        const res = makeRes();
        const next = vi.fn();

        requireRole(['ADMIN'])(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: false, error: 'Authentication required.' }),
        );
        expect(next).not.toHaveBeenCalled();
    });
});
