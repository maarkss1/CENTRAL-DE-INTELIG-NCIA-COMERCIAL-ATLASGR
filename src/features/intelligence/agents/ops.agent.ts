import { StateGraph, MessagesAnnotation, MemorySaver } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { prisma } from '../../../lib/prisma.js';
import { getLeadContextTool } from '../tools/crmTools.js';
import { searchPlaybookTool } from '../tools/playbookTool.js';
import { createFollowUpTaskTool, notifyTeamTool } from '../tools/opsTools.js';
import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import type { Prisma } from '@prisma/client';
import { logger } from '../../../lib/logger.js';
import { getTenantId } from '../../../lib/async-context.js';
import { logAiUsage } from '../../../lib/ai/gateway.js';

const LITELLM_URL = process.env.LITELLM_URL || 'http://localhost:4000';
const LITELLM_KEY = process.env.LITELLM_KEY || 'sk-litellm';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

// Mesmo esquema de load balancing/fallback do SDRQualificationAgent (ver sdr.agent.ts): primário
// via LiteLLM, com fallback direto pra Groq se o proxy falhar.
const primaryLlm = new ChatOpenAI({
    modelName: 'gemini-flash',
    temperature: 0,
    openAIApiKey: LITELLM_KEY,
    maxRetries: 1,
    timeout: 30_000,
    configuration: {
        baseURL: `${LITELLM_URL.replace(/\/+$/, '').replace(/\/v1$/i, '')}/v1`,
    },
});

const fallbackGroqLlm = new ChatOpenAI({
    modelName: 'llama-3.1-8b-instant',
    temperature: 0,
    openAIApiKey: GROQ_API_KEY,
    maxRetries: 1,
    timeout: 30_000,
    configuration: {
        baseURL: 'https://api.groq.com/openai/v1',
    },
});

// O Agente de Operações é o "braço executor" do enxame: não só analisa, ele age nas demais
// ferramentas do sistema (CRM, agenda, notificações), sempre em cima de dados reais buscados
// via get_lead_context/search_playbook — nunca inventando um leadId ou dado de empresa.
const tools = [getLeadContextTool, searchPlaybookTool, createFollowUpTaskTool, notifyTeamTool];
const toolNode = new ToolNode(tools);

const modelWithTools = primaryLlm.bindTools(tools).withFallbacks([
    fallbackGroqLlm.bindTools(tools),
]);

interface SerializedMessage {
    role: string;
    content: string;
    toolCalls?: string;
}

async function callModel(state: typeof MessagesAnnotation.State) {
    const systemPrompt = new SystemMessage(
        `Você é o Agente de Operações (Ops) do Enxame de Inteligência Comercial da Atlas.
Sua missão é EXECUTAR ações concretas nas ferramentas do sistema a partir de uma instrução, nunca apenas descrever o que deveria ser feito.

DIRETRIZES DE EXECUÇÃO:
1. Se a instrução mencionar um Lead e você tiver o ID dele, use 'get_lead_context' para confirmar os dados reais antes de agir — nunca invente nome de empresa, contato ou histórico.
2. Se faltar critério ou regra de negócio (ex: quando agendar follow-up, o que vale um alerta), use 'search_playbook'.
3. Para agendar um lembrete/tarefa de acompanhamento, use 'create_follow_up_task' com uma data ISO 8601 concreta e um leadId real.
4. Para alertar a equipe comercial sobre um risco, oportunidade ou resultado importante, use 'notify_team'.
5. Se a instrução exigir uma ação (agendar, notificar) mas faltar um dado indispensável (ex: nenhum leadId foi informado), não invente um ID: explique objetivamente o que falta e pare.
Trabalhe silenciosamente até completar a ação pedida ou concluir que falta um dado essencial, então responda com um resumo curto e direto do que foi (ou não pôde ser) executado.`,
    );

    const startTime = Date.now();
    const response = await modelWithTools.invoke([systemPrompt, ...state.messages]);

    if (response.usage_metadata) {
        await logAiUsage({
            model: response.response_metadata?.model_name
                || (response.response_metadata?.model as string | undefined)
                || 'gemini-flash',
            usage: {
                totalTokens: response.usage_metadata.total_tokens,
                promptTokens: response.usage_metadata.input_tokens,
                completionTokens: response.usage_metadata.output_tokens,
            },
            latencyMs: Date.now() - startTime,
        });
    }

    return { messages: [response] };
}

function shouldContinue(state: typeof MessagesAnnotation.State) {
    const messages = state.messages;
    const lastMessage = messages[messages.length - 1];

    if (
        !lastMessage
        || typeof (lastMessage as BaseMessage & { tool_calls?: unknown[] }).tool_calls === 'undefined'
        || ((lastMessage as BaseMessage & { tool_calls?: unknown[] }).tool_calls?.length ?? 0) === 0
    ) {
        return 'END';
    }
    return 'tools';
}

const workflow = new StateGraph(MessagesAnnotation)
    .addNode('agent', callModel)
    .addNode('tools', toolNode)
    .addEdge('__start__', 'agent')
    .addConditionalEdges('agent', shouldContinue, {
        tools: 'tools',
        END: '__end__',
    })
    .addEdge('tools', 'agent');

const memory = new MemorySaver();
const app = workflow.compile({ checkpointer: memory });

export class OpsAgent {
    async run(instruction: string, sessionId?: string, leadId?: string) {
        const sid = sessionId || `session-ops-${Date.now()}`;

        const humanContent = leadId
            ? `Instrução: ${instruction}\n\nLead ID relacionado a esta missão (use-o com get_lead_context/create_follow_up_task/notify_team quando fizer sentido; não busque nem invente outro): ${leadId}`
            : `Instrução: ${instruction}\n\nNenhum Lead ID foi informado para esta missão.`;

        const inputs = { messages: [new HumanMessage(humanContent)] };
        const config = { configurable: { thread_id: sid } };
        let finalState;

        try {
            finalState = await app.invoke(inputs, config);
        } catch (error) {
            logger.error({ err: error, sessionId }, 'Ops Agent run failed');
            return { success: false, error: 'Agent execution failed' };
        }

        const messages = finalState.messages as BaseMessage[];

        await this.updateMemory(sid, messages.map((m: BaseMessage): SerializedMessage => {
            const toolCalls = (m as BaseMessage & { tool_calls?: unknown[] }).tool_calls;
            return {
                role: m.type,
                content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                toolCalls: toolCalls ? JSON.stringify(toolCalls) : undefined,
            };
        }));

        const lastMessage = messages[messages.length - 1];
        const output = lastMessage?.content ? lastMessage.content.toString() : 'Ação concluída silenciosamente.';

        return { success: true, sessionId: sid, output };
    }

    private async updateMemory(sessionId: string, messages: SerializedMessage[]) {
        try {
            const organizationId = getTenantId();
            const existing = await prisma.agentMemory.findFirst({
                where: { sessionId, organizationId },
            });
            if (existing) {
                await prisma.agentMemory.update({
                    where: { id: existing.id },
                    data: {
                        messages: messages as unknown as Prisma.InputJsonValue,
                    },
                });
            } else {
                await prisma.agentMemory.create({
                    data: {
                        sessionId,
                        agentType: 'OPS',
                        organizationId,
                        messages: messages as unknown as Prisma.InputJsonValue,
                    },
                });
            }
        } catch (err) {
            logger.error({ err, sessionId }, 'Failed to update agent memory');
        }
    }
}
