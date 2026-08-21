import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';

export interface AssistantHistoryMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt: Date;
}

/** Quantas mensagens a tela carrega ao montar/trocar de marca. */
const HISTORY_LIMIT = 20;

export async function listAssistantHistory(
    organizationId: string,
    userId: string,
    brand: 'atlasgr' | 'totaltrac',
): Promise<AssistantHistoryMessage[]> {
    const rows = await prisma.assistantMessage.findMany({
        where: { organizationId, userId, brand },
        orderBy: { createdAt: 'desc' },
        take: HISTORY_LIMIT,
    });
    return rows.reverse().map((row) => ({
        id: row.id,
        role: row.role as 'user' | 'assistant',
        content: row.content,
        createdAt: row.createdAt,
    }));
}

/**
 * Grava os dois turnos de uma resposta do Chatbook (pergunta do usuário + resposta do
 * assistente) ao final do streaming. Best-effort de propósito: uma falha aqui não deve derrubar
 * uma resposta que o usuário já recebeu — só a sobrevivência a reload é perdida, não a resposta.
 */
export async function appendAssistantTurn(
    organizationId: string,
    userId: string,
    brand: 'atlasgr' | 'totaltrac',
    userText: string,
    assistantText: string,
): Promise<void> {
    try {
        await prisma.assistantMessage.createMany({
            data: [
                { organizationId, userId, brand, role: 'user', content: userText },
                { organizationId, userId, brand, role: 'assistant', content: assistantText },
            ],
        });
    } catch (err) {
        logger.warn({ err, organizationId, userId, brand }, 'Falha ao persistir turno do Chatbook (a resposta já foi entregue ao usuário).');
    }
}
