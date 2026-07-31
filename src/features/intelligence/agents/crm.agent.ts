import { StateGraph, MessagesAnnotation, MemorySaver } from '@langchain/langgraph';
import { BaseMessage, SystemMessage, HumanMessage } from '@langchain/core/messages';
import { getAiModel, logAiUsage } from '../../../lib/ai/gateway.js';
import { prisma } from '../../../lib/prisma.js';
import type { Prisma } from '@prisma/client';
import { logger } from '../../../lib/logger.js';

/**
 * Agente de CRM: Resume o risco de deals e recomenda próximas ações.
 * Refatorado para manter contexto entre interações através do MemorySaver.
 */
export class CRMAgent {
    async run(inputData: string, sessionId?: string) {
        const sid = sessionId || `session-crm-${Date.now()}`;

        const graph = new StateGraph(MessagesAnnotation)
            .addNode('updateStatus', async (state) => {
                const model = getAiModel('gemini-flash', 0.3, 'crm-agent');
                const startTime = Date.now();

                const systemPrompt = new SystemMessage(
                    'Você é um assistente de CRM da Atlas (SaaS B2B de logística). Dado um resumo do estado atual de um deal/negociação, avalie o risco de perda em uma frase e recomende a próxima ação concreta de status/tratativa. Baseie-se SOMENTE no que foi informado. Responda em texto corrido, direto, sem markdown, no formato: "Risco: <avaliação em 1 frase>. Próxima ação: <1 frase de ação concreta>".'
                );

                const response = await model.invoke([systemPrompt, ...state.messages]);

                await logAiUsage({
                    model: response.response_metadata.model,
                    usage: response.response_metadata.tokenUsage,
                    latencyMs: Date.now() - startTime,
                });

                return { messages: [response] };
            })
            .addEdge('__start__', 'updateStatus')
            .addEdge('updateStatus', '__end__');

        const memory = new MemorySaver();
        const compiled = graph.compile({ checkpointer: memory });
        const config = { configurable: { thread_id: sid } };

        let finalState;
        try {
            finalState = await compiled.invoke(
                { messages: [new HumanMessage(`Estado do deal: ${inputData}`)] },
                config
            );
        } catch (error) {
            logger.error({ err: error, sessionId: sid }, 'CRM Agent run failed');
            return { action: `Status updated for: ${inputData}` };
        }

        const messages = finalState.messages as BaseMessage[];
        const lastMessage = messages[messages.length - 1];

        // Persistindo histórico
        await this.updateMemory(sid, messages.map((m: any) => ({
            role: m._getType(),
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        })));

        return { 
            action: lastMessage.content as string,
            sessionId: sid
        };
    }

    private async updateMemory(sessionId: string, messages: BaseMessage[]) {
        try {
            const existing = await prisma.agentMemory.findFirst({ where: { sessionId } });
            if (existing) {
                await prisma.agentMemory.update({
                    where: { id: existing.id },
                    data: { messages: messages as unknown as Prisma.InputJsonValue }
                });
            } else {
                await prisma.agentMemory.create({
                    data: {
                        sessionId,
                        agentType: 'CRM',
                        messages: messages as unknown as Prisma.InputJsonValue,
                    }
                });
            }
        } catch (err) {
            logger.error({ err, sessionId }, 'Failed to update agent memory');
        }
    }
}
