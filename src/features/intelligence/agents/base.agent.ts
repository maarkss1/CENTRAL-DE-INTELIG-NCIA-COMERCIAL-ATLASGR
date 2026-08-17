import { StateGraph, MessagesAnnotation, MemorySaver } from '@langchain/langgraph';
import { BaseMessage, SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { getAiModel, logAiUsage } from '../../../lib/ai/gateway.js';
import { prisma } from '../../../lib/prisma.js';
import type { Prisma } from '@prisma/client';
import { logger } from '../../../lib/logger.js';
import { getTenantId, getUserId } from '../../../lib/async-context.js';
import { getLearningProfile } from './learning.agent.js';

export interface SerializedMessage {
    role: string;
    content: string;
}

export interface AgentRunResult {
    sessionId: string;
    error?: string;
}

/**
 * Classe base abstrata para os agentes de IA do PROSPECTOR-ATLASGR.
 * Centraliza: grafo LangGraph de turno único, memória de longo prazo (AgentMemory),
 * carregamento do perfil de estilo aprendido e tratamento de erros.
 *
 * Subclasses devem implementar:
 * - `agentType`: identificador persistido no AgentMemory (ex: 'BDR', 'CRM')
 * - `buildSystemPrompt(learnedStyle)`: texto do SystemMessage específico do agente
 * - `buildHumanMessage(input)`: HumanMessage de entrada para o grafo
 * - `modelName` (opcional): nome lógico do modelo no gateway (padrão: 'local-llama3-fast')
 * - `temperature` (opcional): temperatura de geração (padrão: 0.4)
 */
export abstract class BaseAgent {
    protected abstract agentType: string;
    protected modelName: string = 'local-llama3-fast';
    protected temperature: number = 0.4;
    // Nome real do modelo Groq usado por runWithTools (namespace diferente de `modelName`, que é
    // o nome lógico resolvido pelo gateway.ts em `run()`) — runWithTools fala direto com
    // LangChain/Groq via bindTools, que o gateway não transporta.
    protected toolsModelName: string = 'openai/gpt-oss-20b';

    protected abstract buildSystemPrompt(learnedStyle: string | null): string;
    protected abstract buildHumanMessage(input: string): string;

    async run(inputData: string, sessionId?: string): Promise<AgentRunResult & Record<string, unknown>> {
        const sid = sessionId || `session-${this.agentType.toLowerCase()}-${Date.now()}`;
        const agentContext = `${this.agentType.toLowerCase()}-agent`;

        const graph = new StateGraph(MessagesAnnotation)
            .addNode('process', async (state) => {
                const model = getAiModel(this.modelName, this.temperature, agentContext);
                const startTime = Date.now();

                const learnedStyle = await this.loadLearnedStyle();
                const systemPrompt = new SystemMessage(this.buildSystemPrompt(learnedStyle));

                const response = await model.invoke([systemPrompt, ...state.messages]);

                await logAiUsage({
                    model: response.response_metadata.model,
                    usage: response.response_metadata.tokenUsage,
                    latencyMs: Date.now() - startTime,
                });

                // O gateway.ts devolve um objeto simples ({content, response_metadata}), não
                // uma instância de mensagem do LangChain — o reducer do MessagesAnnotation só aceita
                // human/AI/system/developer/tool. Sem este wrap, o grafo falha com
                // "Unable to coerce message from array".
                return { messages: [new AIMessage(response.content)] };
            })
            .addEdge('__start__', 'process')
            .addEdge('process', '__end__');

        const memory = new MemorySaver();
        const compiled = graph.compile({ checkpointer: memory });
        const config = { configurable: { thread_id: sid } };

        let finalState;
        try {
            finalState = await compiled.invoke(
                { messages: [new HumanMessage(this.buildHumanMessage(inputData))] },
                config
            );
        } catch (error) {
            logger.error({ err: error, sessionId: sid, agentType: this.agentType }, 'Agent run failed');
            // Nunca fabricar uma resposta falsa: quem chama precisa saber que a IA não respondeu.
            const message = error instanceof Error ? error.message : `Falha desconhecida no Agente ${this.agentType}.`;
            return { error: message, sessionId: sid };
        }

        const messages = finalState.messages as BaseMessage[];
        const lastMessage = messages[messages.length - 1];

        await this.updateMemory(sid, messages.map((m: BaseMessage): SerializedMessage => ({
            role: m.type,
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        })));

        return {
            output: lastMessage.content as string,
            sessionId: sid,
        };
    }

    /**
     * Variante de `run()` para agentes que precisam de ferramentas com loop de tool-calling (ReAct)
     * em vez do turno único do StateGraph acima — usa buildModelWithFallback com bindTools em cada
     * candidato, para que um fallback assumindo no meio da execução não perca acesso às ferramentas.
     * Extraído de BDRAgent/CloserAgent, que tinham essa lógica duplicada linha a linha.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected async runWithTools(inputData: string, tools: any[], sessionId?: string): Promise<AgentRunResult & Record<string, unknown>> {
        const sid = sessionId || `session-${this.agentType.toLowerCase()}-${Date.now()}`;

        try {
            const learnedStyle = await this.loadLearnedStyle();
            const systemPrompt = this.buildSystemPrompt(learnedStyle);

            const { buildModelWithFallback } = await import('./fallback.util.js');
            const { createReactAgent } = await import('@langchain/langgraph/prebuilt');
            const { SystemMessage, HumanMessage } = await import('@langchain/core/messages');

            const model = buildModelWithFallback(this.toolsModelName, tools);
            const agent = createReactAgent({ llm: model, tools });

            const result = await agent.invoke({
                messages: [
                    new SystemMessage(systemPrompt),
                    new HumanMessage(this.buildHumanMessage(inputData)),
                ],
            });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const messages = result.messages as any[];
            const lastMessage = messages[messages.length - 1];

            await this.updateMemory(sid, messages.map((m): SerializedMessage => ({
                role: m._getType(),
                content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
            })));

            return { output: lastMessage.content as string, sessionId: sid };
        } catch (error) {
            logger.error({ err: error, sessionId: sid, agentType: this.agentType }, 'Agent run (with tools) failed');
            const message = error instanceof Error ? error.message : `Falha desconhecida no Agente ${this.agentType}.`;
            return { error: message, sessionId: sid };
        }
    }

    protected async loadLearnedStyle(): Promise<string | null> {
        const tenantId = getTenantId();
        const userId = getUserId();
        if (!tenantId || !userId) return null;
        return getLearningProfile(tenantId, userId);
    }

    protected async updateMemory(sessionId: string, messages: SerializedMessage[]): Promise<void> {
        try {
            const organizationId = getTenantId();
            const existing = await prisma.agentMemory.findFirst({ where: { sessionId, organizationId } });
            if (existing) {
                await prisma.agentMemory.update({
                    where: { id: existing.id },
                    data: { messages: messages as unknown as Prisma.InputJsonValue },
                });
            } else {
                await prisma.agentMemory.create({
                    data: {
                        sessionId,
                        agentType: this.agentType,
                        organizationId,
                        messages: messages as unknown as Prisma.InputJsonValue,
                    },
                });
            }
        } catch (err) {
            logger.error({ err, sessionId, agentType: this.agentType }, 'Failed to update agent memory');
        }
    }
}
