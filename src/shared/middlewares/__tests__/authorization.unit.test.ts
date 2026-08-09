import { describe, it, expect, vi } from 'vitest';
import { requireTenant } from '../authorization';
import { Request, Response } from 'express';

describe('Authorization Middlewares', () => {
    describe('requireTenant', () => {
        it('should call next if organizationId is present', () => {
            const req = { user: { organizationId: 'org-1' } } as unknown as Request;
            const res = {} as Response;
            const next = vi.fn();

            requireTenant(req, res, next);
            expect(next).toHaveBeenCalled();
        });

        it('should return 403 if organizationId is missing', () => {
            const req = { user: { id: 'user-1' } } as unknown as Request;
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn()
            } as unknown as Response;
            const next = vi.fn();

            requireTenant(req, res, next);
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({ success: false, error: 'User is not associated with any tenant/organization.' });
            expect(next).not.toHaveBeenCalled();
        });
    });
});
