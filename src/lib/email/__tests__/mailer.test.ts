import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendMailMock = vi.fn();
const createTransportMock = vi.fn((..._args: unknown[]) => ({ sendMail: sendMailMock }));

vi.mock('nodemailer', () => ({
    default: { createTransport: (...args: unknown[]) => createTransportMock(...args) },
}));

let mockedEnv: Record<string, unknown> = {};
vi.mock('@/config/env', () => ({
    get env() {
        return mockedEnv;
    },
}));

beforeEach(() => {
    vi.resetModules();
    sendMailMock.mockReset();
    createTransportMock.mockClear();
    sendMailMock.mockResolvedValue({});
});

describe('sendEmail', () => {
    it('lança MailerNotConfiguredError quando SMTP_HOST está ausente', async () => {
        mockedEnv = {};
        const { sendEmail, MailerNotConfiguredError } = await import('../mailer.js');

        await expect(sendEmail({ to: 'a@b.com', subject: 'Oi', text: 'Corpo' }))
            .rejects.toBeInstanceOf(MailerNotConfiguredError);
        expect(createTransportMock).not.toHaveBeenCalled();
    });

    it('envia via SMTP quando configurado', async () => {
        mockedEnv = { SMTP_HOST: 'smtp.example.com', SMTP_PORT: 587, SMTP_SECURE: false, SMTP_USER: 'user', SMTP_PASS: 'pass', SMTP_FROM: 'sdr@atlasgr.com.br' };
        const { sendEmail } = await import('../mailer.js');

        await sendEmail({ to: 'lead@empresa.com', subject: 'Proposta', text: 'Corpo do e-mail' });

        expect(createTransportMock).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp.example.com', port: 587 }));
        expect(sendMailMock).toHaveBeenCalledWith({
            from: 'sdr@atlasgr.com.br',
            to: 'lead@empresa.com',
            subject: 'Proposta',
            text: 'Corpo do e-mail',
        });
    });

    it('usa SMTP_USER como remetente quando SMTP_FROM não está definido', async () => {
        mockedEnv = { SMTP_HOST: 'smtp.example.com', SMTP_PORT: 587, SMTP_SECURE: false, SMTP_USER: 'sdr@atlasgr.com.br' };
        const { sendEmail } = await import('../mailer.js');

        await sendEmail({ to: 'lead@empresa.com', subject: 'Proposta', text: 'Corpo' });

        expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({ from: 'sdr@atlasgr.com.br' }));
    });

    it('propaga o erro real quando o envio via SMTP falha', async () => {
        mockedEnv = { SMTP_HOST: 'smtp.example.com', SMTP_PORT: 587, SMTP_SECURE: false };
        sendMailMock.mockRejectedValue(new Error('conexão recusada'));
        const { sendEmail } = await import('../mailer.js');

        await expect(sendEmail({ to: 'lead@empresa.com', subject: 'Proposta', text: 'Corpo' }))
            .rejects.toThrow('conexão recusada');
    });
});
