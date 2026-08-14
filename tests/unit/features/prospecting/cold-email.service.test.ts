import { describe, it, expect, vi, beforeEach } from 'vitest';

// sendColdEmail antes desta correção: (1) nunca enviava nada de verdade — só logava e retornava
// `true` incondicionalmente, uma falsa promessa de entrega; (2) logava o endereço de e-mail
// completo do titular em texto puro (PII em log). Agora envia de verdade via o mesmo mailer real
// usado em aiPendingAction.service.ts/auth.ts (src/lib/email/mailer.ts) e só loga o domínio.

const sendEmailMock = vi.fn();
const { FakeMailerNotConfiguredError } = vi.hoisted(() => ({
    FakeMailerNotConfiguredError: class FakeMailerNotConfiguredError extends Error {},
}));
vi.mock('../../../../src/lib/email/mailer.js', () => ({
    sendEmail: (...args: unknown[]) => sendEmailMock(...args),
    MailerNotConfiguredError: FakeMailerNotConfiguredError,
}));

const loggerInfo = vi.fn();
const loggerWarn = vi.fn();
const loggerError = vi.fn();
vi.mock('../../../../src/lib/logger', () => ({
    logger: { info: (...a: unknown[]) => loggerInfo(...a), warn: (...a: unknown[]) => loggerWarn(...a), error: (...a: unknown[]) => loggerError(...a) },
}));

const { sendColdEmail } = await import('../../../../src/features/prospecting/services/cold-email.service');

const validCampaign = {
    id: '1',
    targetEmail: 'titular@empresa-cliente.com.br',
    subject: 'Test',
    body: 'Hello',
    status: 'draft' as const,
    legalBasis: 'legitimate_interest' as const,
    dataSource: 'apollo',
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe('Cold Email Service', () => {
    it('falha se faltarem campos obrigatórios, sem tentar enviar', async () => {
        const result = await sendColdEmail({} as any);
        expect(result).toBe(false);
        expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it('falha se faltarem os campos de conformidade LGPD, sem tentar enviar', async () => {
        const result = await sendColdEmail({
            id: '1',
            targetEmail: 'test@example.com',
            subject: 'Test',
            body: 'Hello',
            status: 'draft',
            legalBasis: '',
            dataSource: ''
        } as any);
        expect(result).toBe(false);
        expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it('envia de verdade via SMTP e só retorna true quando o envio realmente aconteceu', async () => {
        sendEmailMock.mockResolvedValue(undefined);

        const result = await sendColdEmail(validCampaign);

        expect(result).toBe(true);
        expect(sendEmailMock).toHaveBeenCalledWith({
            to: validCampaign.targetEmail,
            subject: validCampaign.subject,
            text: validCampaign.body,
        });
    });

    it('sem SMTP configurado: retorna false honesto (não finge sucesso) e não lança', async () => {
        sendEmailMock.mockRejectedValue(new FakeMailerNotConfiguredError('sem SMTP_HOST'));

        const result = await sendColdEmail(validCampaign);

        expect(result).toBe(false);
    });

    it('falha real de envio: retorna false', async () => {
        sendEmailMock.mockRejectedValue(new Error('timeout de conexão SMTP'));

        const result = await sendColdEmail(validCampaign);

        expect(result).toBe(false);
    });

    it('nunca loga o endereço de e-mail completo do titular (PII) — só o domínio', async () => {
        sendEmailMock.mockResolvedValue(undefined);

        await sendColdEmail(validCampaign);

        const allLogCalls = [...loggerInfo.mock.calls, ...loggerWarn.mock.calls, ...loggerError.mock.calls];
        const serialized = JSON.stringify(allLogCalls);

        expect(serialized).not.toContain(validCampaign.targetEmail);
        expect(serialized).toContain('empresa-cliente.com.br');
    });
});
