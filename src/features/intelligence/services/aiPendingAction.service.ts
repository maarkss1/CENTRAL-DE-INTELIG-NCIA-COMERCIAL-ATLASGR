import type { AIPendingAction } from '@prisma/client';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { sendEmail, MailerNotConfiguredError } from '../../../lib/email/mailer.js';

export interface ExecutionResult {
    /** true = enviado de verdade agora. false = não enviado (não configurado, falhou, ou tipo de ação não suportado). */
    sent: boolean;
    /** Só relevante quando sent=false: 'not_configured' deixa a tela cair pro fallback manual (mailto:) sem soar como erro do usuário. */
    reason?: 'not_configured' | 'send_failed' | 'unsupported_action';
}

interface SendEmailPayload {
    to?: string;
    subject?: string;
    body?: string;
}

/**
 * Executa de fato uma AIPendingAction já aprovada (IA-005). Hoje só existe um tipo de ação
 * produzido pelo sistema ('send_email', ver sdr-agent.ts) — tipos futuros que não tiverem um
 * dispatch aqui caem em 'unsupported_action', nunca em um "sucesso" fingido.
 *
 * Nunca lança: a falha (ou ausência de configuração) é reportada no retorno para o chamador
 * decidir o fallback, não interrompe o fluxo de aprovação em si.
 */
export async function executeAction(action: Pick<AIPendingAction, 'id' | 'action' | 'payload'>): Promise<ExecutionResult> {
    if (action.action !== 'send_email') {
        return { sent: false, reason: 'unsupported_action' };
    }

    const payload = action.payload as SendEmailPayload;
    if (!payload.to || !payload.subject || !payload.body) {
        return { sent: false, reason: 'unsupported_action' };
    }

    try {
        await sendEmail({ to: payload.to, subject: payload.subject, text: payload.body });
        return { sent: true };
    } catch (error) {
        if (error instanceof MailerNotConfiguredError) {
            return { sent: false, reason: 'not_configured' };
        }
        logger.error({ err: error, actionId: action.id }, 'Falha ao executar AIPendingAction (envio de e-mail).');
        return { sent: false, reason: 'send_failed' };
    }
}

/** Executa a ação e persiste o resultado (executed/executedAt/executionError) na própria linha. */
export async function executeAndRecord(action: Pick<AIPendingAction, 'id' | 'action' | 'payload'>): Promise<ExecutionResult> {
    const result = await executeAction(action);

    await prisma.aIPendingAction.update({
        where: { id: action.id },
        data: result.sent
            ? { executed: true, executedAt: new Date(), executionError: null }
            : { executionError: result.reason === 'send_failed' ? 'Falha ao enviar o e-mail via SMTP.' : null },
    });

    return result;
}
