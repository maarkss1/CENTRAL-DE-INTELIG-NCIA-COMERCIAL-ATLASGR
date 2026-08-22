import type { AIPendingAction } from '@prisma/client';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { sendEmail, MailerNotConfiguredError } from '../../../lib/email/mailer.js';
import { container } from '../../../shared/di/container.js';
import type { NoteUseCases } from '../../notes/application/NoteUseCases.js';
import { activityService } from '../../activities/services/activity.service.js';
import type { ActivityType } from '../../../lib/zod.js';

export interface ExecutionResult {
    /** Mantido como `sent` por compatibilidade com a API/UI: true significa que a ação foi executada. */
    sent: boolean;
    reason?: 'not_configured' | 'send_failed' | 'unsupported_action' | 'missing_owner';
}

interface SendEmailPayload {
    to?: string;
    subject?: string;
    body?: string;
}

interface SwarmRecommendationPayload {
    leadId?: string;
    synthesis?: string;
    triggerDetail?: string;
}

interface CreateFollowUpPayload {
    leadId?: string;
    date?: string;
    type?: ActivityType;
    observations?: string;
    owner?: string;
}

type ExecutableAction = Pick<AIPendingAction, 'id' | 'action' | 'payload' | 'organizationId'>;

/**
 * Executor central de ações aprovadas. Cada tipo só entra aqui quando existe uma implementação
 * concreta, validada e auditável; tipos desconhecidos nunca retornam um sucesso fictício.
 */
export async function executeAction(action: ExecutableAction): Promise<ExecutionResult> {
    try {
        if (action.action === 'send_email') {
            const payload = action.payload as SendEmailPayload;
            if (!payload.to || !payload.subject || !payload.body) {
                return { sent: false, reason: 'unsupported_action' };
            }
            await sendEmail({ to: payload.to, subject: payload.subject, text: payload.body });
            return { sent: true };
        }

        if (action.action === 'swarm_recommendation') {
            const payload = action.payload as SwarmRecommendationPayload;
            if (!action.organizationId || !payload.leadId || !payload.synthesis) {
                return { sent: false, reason: 'unsupported_action' };
            }
            await container.resolve<NoteUseCases>('NoteUseCases').createNote(action.organizationId, payload.leadId, {
                author: 'Enxame de IA AtlasGR',
                content: [
                    'Recomendação autônoma aprovada',
                    payload.triggerDetail ? `Gatilho: ${payload.triggerDetail}` : null,
                    payload.synthesis,
                ].filter(Boolean).join('\n\n'),
            });
            return { sent: true };
        }

        if (action.action === 'create_follow_up') {
            const payload = action.payload as CreateFollowUpPayload;
            if (!action.organizationId || !payload.leadId || !payload.date) {
                return { sent: false, reason: 'unsupported_action' };
            }

            // Mesmo princípio do `create_follow_up_task` da ferramenta de IA (`opsTools.ts`): sem
            // `owner` explícito no payload, o responsável real é o dono do próprio Lead — nunca um
            // nome de IA fabricado. `activityService.create` já rejeitaria o placeholder via
            // `assertRealOwner`, mas resolver aqui evita tratar "sem responsável" como falha
            // genérica (`send_failed`) e dá um motivo específico e acionável.
            let resolvedOwner = payload.owner?.trim();
            if (!resolvedOwner) {
                const lead = await prisma.lead.findFirst({
                    where: { id: payload.leadId, organizationId: action.organizationId },
                    select: { owner: true },
                });
                resolvedOwner = lead?.owner?.trim() || undefined;
                if (!resolvedOwner) {
                    return { sent: false, reason: 'missing_owner' };
                }
            }

            await activityService.create(action.organizationId, {
                leadId: payload.leadId,
                date: payload.date,
                type: payload.type || 'Follow-up',
                status: 'Pendente',
                owner: resolvedOwner,
                observations: payload.observations ?? null,
            });
            return { sent: true };
        }

        return { sent: false, reason: 'unsupported_action' };
    } catch (error) {
        if (error instanceof MailerNotConfiguredError) {
            return { sent: false, reason: 'not_configured' };
        }
        logger.error({ err: error, actionId: action.id, action: action.action }, 'Falha ao executar AIPendingAction.');
        return { sent: false, reason: 'send_failed' };
    }
}

/** Executa a ação e persiste tentativas, instante, sucesso e erro na própria linha do ledger. */
export async function executeAndRecord(action: ExecutableAction): Promise<ExecutionResult> {
    const result = await executeAction(action);

    const attemptData = {
        attempts: { increment: 1 },
        lastAttemptAt: new Date(),
    };
    await prisma.aIPendingAction.update({
        where: { id: action.id },
        data: result.sent
            ? {
                ...attemptData,
                executed: true,
                executedAt: new Date(),
                executionError: null,
            }
            : {
                ...attemptData,
                executionError: result.reason === 'send_failed'
                    ? 'Falha ao executar a ação autônoma.'
                    : result.reason === 'unsupported_action'
                        ? 'Tipo de ação ou payload ainda não suportado pelo executor.'
                        : result.reason === 'missing_owner'
                            ? 'Lead sem responsável real definido no CRM — informe o responsável explicitamente para executar esta ação.'
                            : null,
            },
    });

    return result;
}
