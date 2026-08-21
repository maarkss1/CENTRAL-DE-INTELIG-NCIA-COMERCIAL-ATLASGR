import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import type { ConversationSignalDraft, ConversationSignalPort } from '../domain/replyTracking.js';

/**
 * Implementação real do `ConversationSignalPort` (CYC-003, onda 26) — grava `ConversationSignal`
 * com `channel: 'email'`, mesma tabela já usada pelo canal WhatsApp
 * (`conversation-intelligence.service.ts`). Também registra o timeline do lead, espelhando o que
 * o webhook de WhatsApp faz para uma mensagem recebida (`whatsappMessage.service.ts`).
 */
export const prismaConversationSignalPort: ConversationSignalPort = {
    async record(draft: ConversationSignalDraft): Promise<void> {
        await prisma.conversationSignal.create({
            data: {
                organizationId: draft.organizationId,
                leadId: draft.leadId,
                channel: draft.channel,
                messageCount: draft.messageCount,
                intent: draft.intent,
                urgency: draft.urgency,
                objections: draft.objections,
                budgetMentioned: draft.budgetMentioned,
                nextStep: draft.nextStep,
                summary: draft.summary,
                confidence: draft.confidence,
                rawModelOutput: draft.rawModelOutput as never,
            },
        });

        if (draft.summary) {
            await prisma.timelineEvent.create({
                data: {
                    type: 'email',
                    description: `Sinal de conversa (IA, e-mail): ${draft.summary}`,
                    leadId: draft.leadId,
                },
            }).catch((error) => {
                // O sinal já foi salvo — a falha aqui não pode apagar essa leitura.
                logger.error({ err: error, leadId: draft.leadId }, 'Falha ao registrar sinal de e-mail no timeline do lead.');
            });
        }
    },
};
