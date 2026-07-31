import { StateGraph, MessagesAnnotation, MemorySaver } from '@langchain/langgraph';
import { BaseMessage, SystemMessage, HumanMessage } from '@langchain/core/messages';
import { getAiModel, logAiUsage } from '../../../lib/ai/gateway.js';
import { prisma } from '../../../lib/prisma.js';
import type { Prisma } from '@prisma/client';
import { logger } from '../../../lib/logger.js';

/**
 * BDR (Business Development Rep) autônomo: Qualifica o fit outbound e rascunha a linha de abordagem.
 * Agora com suporte a Memória de Longo Prazo (Thread History) e Estado Multiturno.
 */
export class BDRAgent {
    async run(inputData: string, sessionId?: string) {
        const sid = sessionId || `session-bdr-${Date.now()}`;

        const graph = new StateGraph(MessagesAnnotation)
            .addNode('qualify', async (state) => {
                const model = getAiModel('gemini-flash', 0.4, 'bdr-agent');
                const startTime = Date.now();

                const systemPrompt = new SystemMessage(
                    'Você é um BDR sênior da Atlas (SaaS de gestão de risco/torre de controle para logística B2B no Brasil). Dado um resumo bruto de lead outbound, avalie o fit em uma frase objetiva e sugira a melhor linha de abertura para o primeiro contato. Baseie-se SOMENTE no que foi informado — nunca invente dados da empresa. Responda em texto corrido, direto, sem markdown, no formato: "Fit: <avaliação em 1 frase>. Abertura sugerida: <1 frase de abertura>".'
                );

                const response = await model.invoke([systemPrompt, ...state.messages]);

                await logAiUsage({
                    model: response.response_metadata.model,
                    usage: response.response_metadata.tokenUsage,
                    latencyMs: Date.now() - startTime,
                });

                return { messages: [response] };
            })
            .addEdge('__start__', 'qualify')
            .addEdge('qualify', '__end__');

        const memory = new MemorySaver();
        const compiled = graph.compile({ checkpointer: memory });
        const config = { configurable: { thread_id: sid } };

        let finalState;
        try {
            finalState = await compiled.invoke(
                { messages: [new HumanMessage(`Resumo do lead: ${inputData}`)] },
                config
            );
        } catch (error) {
            logger.error({ err: error, sessionId: sid }, 'BDR Agent run failed');
            return { qualification: `Qualified: ${inputData}` };
        }

        const messages = finalState.messages as BaseMessage[];
        const lastMessage = messages[messages.length - 1];

        // Persistindo histórico
        await this.updateMemory(sid, messages.map((m: BaseMessage) => ({
            role: m._getType(),
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        })));

        return { 
            qualification: lastMessage.content as string,
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
                        agentType: 'BDR',
                        messages: messages as unknown as Prisma.InputJsonValue,
                    }
                });
            }
        } catch (err) {
            logger.error({ err, sessionId }, 'Failed to update agent memory');
        }
    }
}
