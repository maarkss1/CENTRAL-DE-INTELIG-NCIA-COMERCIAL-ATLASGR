import { StateGraph, MessagesAnnotation, MemorySaver } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { prisma } from '../../../lib/prisma.js';
import { getLeadContextTool, updateLeadQualificationTool } from '../tools/crmTools.js';
import { searchPlaybookTool } from '../tools/playbookTool.js';
import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import type { Prisma } from '@prisma/client';
import { logger } from '../../../lib/logger.js';

const LITELLM_URL = process.env.LITELLM_URL || 'http://localhost:4000';
const LITELLM_KEY = process.env.LITELLM_KEY || 'sk-litellm';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

// --- NÓ DE LOAD BALANCING / FALLBACK ---
// Modelo Primário: Gemini Flash via LiteLLM
const primaryLlm = new ChatOpenAI({
    modelName: 'gemini-flash',
    temperature: 0,
    openAIApiKey: LITELLM_KEY,
    maxRetries: 1,
    timeout: 30_000,
    configuration: {
        baseURL: `${LITELLM_URL.replace(/\/+$/, '').replace(/\/v1$/i, '')}/v1`
    }
});

// Modelo Secundário: Llama 3 via Groq API
const fallbackGroqLlm = new ChatOpenAI({
    modelName: 'llama-3.1-8b-instant',
    temperature: 0,
    openAIApiKey: GROQ_API_KEY,
    maxRetries: 1,
    timeout: 30_000,
    configuration: {
        baseURL: 'https://api.groq.com/openai/v1'
    }
});

// As ferramentas que o SDR Autônomo tem acesso
const tools = [getLeadContextTool, searchPlaybookTool, updateLeadQualificationTool];
const toolNode = new ToolNode(tools);

// Encadeamento inteligente: Tenta primário com ferramentas, se falhar, vai pro fallback com ferramentas
const modelWithTools = primaryLlm.bindTools(tools).withFallbacks([
    fallbackGroqLlm.bindTools(tools)
]);

// Definição da lógica do Agente
async function callModel(state: typeof MessagesAnnotation.State) {
    const systemPrompt = new SystemMessage(
        `Você é a IA principal de Pré-Vendas (SDR Autônomo) da Atlas, arquitetada para qualificação cirúrgica de leads B2B.
Sua missão não é apenas ler dados, mas EXECUTAR UMA ANÁLISE DE RISCO LOGÍSTICO COMPLETA baseada no ICP.

DIRETRIZES DE EXECUÇÃO:
1. USE FERRAMENTAS: Obtenha os dados do Lead com 'get_lead_context'. Se o contexto faltar, chame a ferramenta de pesquisa de playbook para buscar o 'ICP da Atlas'.
2. RACIOCÍNIO FRIO: Analise o Fit Score (0 a 100) baseando-se ESTRITAMENTE em porte (frota, faturamento), situação cadastral e aderência ao segmento logístico.
3. SAÍDA FINAL OBRIGATÓRIA: Após compilar as evidências, USE a ferramenta 'update_lead_qualification'. 
   - A nota deve refletir a realidade crua dos dados.
   - O status deve ser 'Primeiro_Contato' apenas para leads com nota > 75, caso contrário 'Qualificacao' ou 'Descartado'.
Trabalhe silenciosamente e não faça perguntas ao usuário. Aja até completar a tarefa chamando 'update_lead_qualification'.`
    );

    const response = await modelWithTools.invoke([systemPrompt, ...state.messages]);
    return { messages: [response] };
}

function shouldContinue(state: typeof MessagesAnnotation.State) {
    const messages = state.messages;
    const lastMessage = messages[messages.length - 1];
    
    // Se não for BaseMessage ou não tiver tool_calls, finalizamos.
    if (
        !lastMessage || 
        typeof (lastMessage as BaseMessage & { tool_calls?: unknown[] }).tool_calls === 'undefined' ||
        ((lastMessage as BaseMessage & { tool_calls?: unknown[] }).tool_calls?.length ?? 0) === 0
    ) {
        return "END";
    }
    return "tools";
}

// Arquitetura Customizada do LangGraph
const workflow = new StateGraph(MessagesAnnotation)
    .addNode("agent", callModel)
    .addNode("tools", toolNode)
    .addEdge("__start__", "agent")
    .addConditionalEdges("agent", shouldContinue, {
        tools: "tools",
        END: "__end__",
    })
    .addEdge("tools", "agent");

// Adicionando LangMem via MemorySaver (Armazenamento na RAM para Sessões ativas)
const memory = new MemorySaver();
const app = workflow.compile({ checkpointer: memory });

export class SDRQualificationAgent {
    async run(leadId: string, sessionId?: string) {
        const sid = sessionId || `session-${leadId}-${Date.now()}`;
        
        const inputs = {
            messages: [new HumanMessage(`Inicie a análise e qualificação do lead com o ID: ${leadId}`)]
        };

        const config = { configurable: { thread_id: sid } };
        let finalState;

        try {
            // Invoca o gráfico (state machine) com checkpointer ativado para manter histórico na thread.
            finalState = await app.invoke(inputs, config);
        } catch (error) {
            logger.error({ err: error, leadId, sessionId }, 'SDR Agent run failed');
            return { success: false, error: 'Agent execution failed' };
        }

        const messages = finalState.messages as BaseMessage[];
        
        // Persistindo no nosso banco relacional de memória a longo prazo (AgentMemory)
        await this.updateMemory(sid, messages.map((m: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
            role: m._getType(),
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
            toolCalls: m.tool_calls ? JSON.stringify(m.tool_calls) : undefined,
        })));

        const lastMessage = messages[messages.length - 1];
        const detailedContent = lastMessage?.content ? lastMessage.content.toString() : 'Análise concluída silenciosamente.';

        return { success: true, sessionId: sid, detailedLog: detailedContent };
    }

    private async updateMemory(sessionId: string, messages: BaseMessage[]) {
        try {
            const existing = await prisma.agentMemory.findFirst({
                where: { sessionId }
            });
            if (existing) {
                await prisma.agentMemory.update({
                    where: { id: existing.id },
                    data: {
                        messages: messages as unknown as Prisma.InputJsonValue,
                    }
                });
            } else {
                await prisma.agentMemory.create({
                    data: {
                        sessionId,
                        agentType: 'SDR',
                        messages: messages as unknown as Prisma.InputJsonValue,
                    }
                });
            }
        } catch (err) {
            logger.error({ err, sessionId }, 'Failed to update agent memory');
        }
    }
}
