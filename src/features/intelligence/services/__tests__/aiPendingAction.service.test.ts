import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendEmailMock = vi.fn();
const noteCreateMock = vi.fn();
const activityCreateMock = vi.fn();

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

vi.mock('@/features/notes/services/note.service', () => ({
    noteService: { create: (...args: unknown[]) => noteCreateMock(...args) },
}));

vi.mock('@/features/activities/services/activity.service', () => ({
    activityService: { create: (...args: unknown[]) => activityCreateMock(...args) },
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
    organizationId: 'org-1',
};

describe('executeAction', () => {
    it('envia e-mail quando o SMTP está configurado', async () => {
        sendEmailMock.mockResolvedValue(undefined);

        const result = await executeAction(emailAction);

        expect(sendEmailMock).toHaveBeenCalledWith({ to: 'lead@empresa.com', subject: 'Proposta', text: 'Olá, tudo bem?' });
        expect(result).toEqual({ sent: true });
    });

    it('reporta not_configured sem lançar quando não há SMTP', async () => {
        sendEmailMock.mockRejectedValue(new FakeMailerNotConfiguredError('sem SMTP_HOST'));

        expect(await executeAction(emailAction)).toEqual({ sent: false, reason: 'not_configured' });
    });

    it('reporta send_failed quando a execução concreta falha', async () => {
        sendEmailMock.mockRejectedValue(new Error('timeout de conexão'));

        expect(await executeAction(emailAction)).toEqual({ sent: false, reason: 'send_failed' });
    });

    it('rejeita tipo de ação desconhecido', async () => {
        const result = await executeAction({ id: 'act-2', action: 'call_lead', payload: {}, organizationId: 'org-1' });

        expect(result).toEqual({ sent: false, reason: 'unsupported_action' });
        expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it('rejeita payload de e-mail incompleto', async () => {
        const result = await executeAction({
            id: 'act-3',
            action: 'send_email',
            payload: { to: 'lead@empresa.com' },
            organizationId: 'org-1',
        });

        expect(result).toEqual({ sent: false, reason: 'unsupported_action' });
    });

    it('salva recomendação do enxame como nota auditável', async () => {
        noteCreateMock.mockResolvedValue({ id: 'note-1' });

        const result = await executeAction({
            id: 'act-4',
            action: 'swarm_recommendation',
            organizationId: 'org-1',
            payload: { leadId: 'lead-1', synthesis: 'Acionar o decisor hoje.', triggerDetail: 'Proposta parada.' },
        });

        expect(result).toEqual({ sent: true });
        expect(noteCreateMock).toHaveBeenCalledWith('org-1', 'lead-1', expect.objectContaining({
            author: 'Enxame de IA AtlasGR',
            content: expect.stringContaining('Acionar o decisor hoje.'),
        }));
    });

    it('cria follow-up interno com payload tipado', async () => {
        activityCreateMock.mockResolvedValue({ id: 'activity-1' });

        const result = await executeAction({
            id: 'act-5',
            action: 'create_follow_up',
            organizationId: 'org-1',
            payload: { leadId: 'lead-1', date: '2026-08-10T13:00:00.000Z', observations: 'Retomar proposta.' },
        });

        expect(result).toEqual({ sent: true });
        expect(activityCreateMock).toHaveBeenCalledWith('org-1', expect.objectContaining({
            leadId: 'lead-1',
            type: 'Follow-up',
            status: 'Pendente',
        }));
    });
});

describe('executeAndRecord', () => {
    it('marca execução e telemetria quando a ação dá certo', async () => {
        sendEmailMock.mockResolvedValue(undefined);

        await executeAndRecord(emailAction);

        expect(updateMock.update).toHaveBeenCalledWith({
            where: { id: 'act-1' },
            data: expect.objectContaining({
                executed: true,
                executionError: null,
                attempts: { increment: 1 },
            }),
        });
    });

    it('registra falha e tentativa sem marcar como executado', async () => {
        sendEmailMock.mockRejectedValue(new Error('timeout'));

        await executeAndRecord(emailAction);

        expect(updateMock.update).toHaveBeenCalledWith({
            where: { id: 'act-1' },
            data: expect.objectContaining({
                executionError: 'Falha ao executar a ação autônoma.',
                attempts: { increment: 1 },
            }),
        });
    });

    it('trava 6 do modo full (SMTP configurado): sem SMTP, a ação NUNCA é marcada como executada — fica registrada para tratamento supervisionado', async () => {
        sendEmailMock.mockRejectedValue(new FakeMailerNotConfiguredError('SMTP_HOST ausente'));

        const result = await executeAndRecord(emailAction);

        expect(result).toEqual({ sent: false, reason: 'not_configured' });
        const [[callArgs]] = updateMock.update.mock.calls;
        // `executed` nunca aparece como `true` neste payload — não fabricamos um envio que não
        // aconteceu. A UI (AIPendingActions.tsx) usa isso para continuar oferecendo o fallback
        // manual em vez de considerar a ação concluída.
        expect(callArgs.data.executed).not.toBe(true);
        expect(callArgs.data.attempts).toEqual({ increment: 1 });
    });
});
