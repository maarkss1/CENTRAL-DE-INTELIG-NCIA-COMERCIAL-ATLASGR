import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendEmailMock = vi.fn();

const { FakeMailerNotConfiguredError } = vi.hoisted(() => ({
    FakeMailerNotConfiguredError: class FakeMailerNotConfiguredError extends Error {},
}));

vi.mock('@/lib/email/mailer', () => ({
    sendEmail: (...args: unknown[]) => sendEmailMock(...args),
    MailerNotConfiguredError: FakeMailerNotConfiguredError,
}));

vi.mock('@/lib/prisma', () => ({
    prisma: { aIPendingAction: { update: vi.fn() } },
}));

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { prisma } from '@/lib/prisma';
import { executeAction, executeAndRecord } from '../aiPendingAction.service';

const updateMock = prisma.aIPendingAction as unknown as { update: ReturnType<typeof vi.fn> };

beforeEach(() => {
    vi.clearAllMocks();
    updateMock.update.mockResolvedValue({});
});

const emailAction = {
    id: 'act-1',
    action: 'send_email',
    payload: { to: 'lead@empresa.com', subject: 'Proposta', body: 'Olá, tudo bem?' },
};

describe('executeAction', () => {
    it('envia o e-mail e reporta sent=true quando configurado', async () => {
        sendEmailMock.mockResolvedValue(undefined);

        const result = await executeAction(emailAction);

        expect(sendEmailMock).toHaveBeenCalledWith({ to: 'lead@empresa.com', subject: 'Proposta', text: 'Olá, tudo bem?' });
        expect(result).toEqual({ sent: true });
    });

    it('reporta not_configured sem lançar quando o SMTP não está configurado', async () => {
        sendEmailMock.mockRejectedValue(new FakeMailerNotConfiguredError('sem SMTP_HOST'));

        const result = await executeAction(emailAction);

        expect(result).toEqual({ sent: false, reason: 'not_configured' });
    });

    it('reporta send_failed sem lançar quando o envio real falha', async () => {
        sendEmailMock.mockRejectedValue(new Error('timeout de conexão'));

        const result = await executeAction(emailAction);

        expect(result).toEqual({ sent: false, reason: 'send_failed' });
    });

    it('reporta unsupported_action para qualquer tipo de ação que não seja send_email', async () => {
        const result = await executeAction({ id: 'act-2', action: 'call_lead', payload: {} });

        expect(result).toEqual({ sent: false, reason: 'unsupported_action' });
        expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it('reporta unsupported_action quando o payload de send_email está incompleto', async () => {
        const result = await executeAction({ id: 'act-3', action: 'send_email', payload: { to: 'lead@empresa.com' } });

        expect(result).toEqual({ sent: false, reason: 'unsupported_action' });
        expect(sendEmailMock).not.toHaveBeenCalled();
    });
});

describe('executeAndRecord', () => {
    it('marca executed=true e limpa executionError quando o envio dá certo', async () => {
        sendEmailMock.mockResolvedValue(undefined);

        await executeAndRecord(emailAction);

        expect(updateMock.update).toHaveBeenCalledWith({
            where: { id: 'act-1' },
            data: expect.objectContaining({ executed: true, executionError: null }),
        });
    });

    it('registra a mensagem de erro quando o envio falha, sem marcar executed', async () => {
        sendEmailMock.mockRejectedValue(new Error('timeout'));

        await executeAndRecord(emailAction);

        expect(updateMock.update).toHaveBeenCalledWith({
            where: { id: 'act-1' },
            data: { executionError: 'Falha ao enviar o e-mail via SMTP.' },
        });
    });
});
