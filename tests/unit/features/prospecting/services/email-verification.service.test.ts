import { afterEach, describe, expect, it, vi } from 'vitest';

const resolveMx = vi.fn();
vi.mock('node:dns/promises', () => ({
    default: { resolveMx: (...args: unknown[]) => resolveMx(...args) },
    resolveMx: (...args: unknown[]) => resolveMx(...args),
}));

const { checkEmailDeliverability } = await import(
    '../../../../../src/features/prospecting/services/email-verification.service'
);

afterEach(() => {
    vi.restoreAllMocks();
});

describe('Email deliverability check', () => {
    it('rejects malformed addresses without touching DNS', async () => {
        const result = await checkEmailDeliverability('not-an-email');
        expect(result).toEqual({ email: 'not-an-email', status: 'invalid', reason: 'invalid_format' });
        expect(resolveMx).not.toHaveBeenCalled();
    });

    it('rejects known disposable-domain addresses without touching DNS', async () => {
        const result = await checkEmailDeliverability('teste@mailinator.com');
        expect(result.status).toBe('invalid');
        expect(result.reason).toBe('disposable_domain');
        expect(resolveMx).not.toHaveBeenCalled();
    });

    it('verifies an address whose domain has a real MX record', async () => {
        resolveMx.mockResolvedValueOnce([{ exchange: 'mx.example.com.br', priority: 10 }]);

        const result = await checkEmailDeliverability('Comercial@Empresa.Com.Br');

        expect(result).toEqual({ email: 'comercial@empresa.com.br', status: 'verified' });
        expect(resolveMx).toHaveBeenCalledWith('empresa.com.br');
    });

    it('marks as invalid when the domain has no mail server (ENOTFOUND)', async () => {
        resolveMx.mockRejectedValueOnce(Object.assign(new Error('not found'), { code: 'ENOTFOUND' }));

        const result = await checkEmailDeliverability('contato@dominio-inexistente.com.br');

        expect(result).toEqual({
            email: 'contato@dominio-inexistente.com.br',
            status: 'invalid',
            reason: 'no_mail_server',
        });
    });

    it('does not penalize the email when the DNS check itself is inconclusive', async () => {
        resolveMx.mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' }));

        const result = await checkEmailDeliverability('contato@empresa.com.br');

        expect(result.status).toBe('unknown');
        expect(result.reason).toBe('check_failed');
    });
});
