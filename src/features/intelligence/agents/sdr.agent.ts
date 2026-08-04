import { StateGraph, MessagesAnnotation, MemorySaver } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { prisma } from '../../../lib/prisma.js';
import { getLeadContextTool, updateLeadQualificationTool } from '../tools/crmTools.js';
import { searchPlaybookTool } from '../tools/playbookTool.js';
import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import type { Prisma } from '@prisma/client';
import { logger } from '../../../lib/logger.js';
import { getTenantId, getUserId } from '../../../lib/async-context.js';
import { getLearningProfile } from './learning.agent.js';
import { logAiUsage } from '../../../lib/ai/gateway.js';

// As ferramentas que o SDR Autônomo tem acesso
const tools = [getLeadContextTool, searchPlaybookTool, updateLeadQualificationTool];
const toolNode = new ToolNode(tools);

// Lazy + memoizado: monta o cliente só no primeiro uso real, nunca na carga do módulo —
// process.env.GROQ_API_KEY lido numa const de topo de arquivo ficava congelado como vazio se este
// módulo fosse importado antes de `dotenv/config` terminar de rodar. Motor local (Ollama via
// LiteLLM) removido de propósito: processa uma completion por vez nesta máquina, travando o
// enxame inteiro por vários segundos a cada etapa. Groq é rápido e não tem esse gargalo.
let cachedModelWithTools: ReturnType<ChatOpenAI['bindTools']> | null = null;
function getModelWithTools() {
    if (cachedModelWithTools) return cachedModelWithTools;

    const groqLlm = new ChatOpenAI({
        modelName: 'llama-3.1-8b-instant',
        temperature: 0,
        apiKey: process.env.GROQ_API_KEY || '',
        // 3, não 1: o tier gratuito do Groq tem TPM baixo (6000/min) e um enxame de 4 agentes
        // facilmente bate nele no meio de uma missão — o SDK do OpenAI já respeita o header
        // Retry-After do 429 automaticamente, então mais tentativas custam pouco e evitam derrubar
        // a etapa inteira por um rate limit que se resolve em menos de 1s.
        maxRetries: 3,
        timeout: 30_000,
        configuration: {
            baseURL: 'https://api.groq.com/openai/v1'
        }
    });

    cachedModelWithTools = groqLlm.bindTools(tools);
    return cachedModelWithTools;
}

interface SerializedMessage {
    role: string;
    content: string;
    toolCalls?: string;
}

async function loadLearnedStyle(): Promise<string | null> {
    const tenantId = getTenantId();
    const userId = getUserId();
    if (!tenantId || !userId) return null;
    return getLearningProfile(tenantId, userId);
}

// Definição da lógica do Agente
async function callModel(state: typeof MessagesAnnotation.State) {
    const learnedStyle = await loadLearnedStyle();
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
        + (learnedStyle ? `\n\nEstilo aprendido do usuário (aplique como preferência, sem contrariar as regras acima):\n${learnedStyle}` : '')
    );

    const startTime = Date.now();
    const response = await getModelWithTools().invoke([systemPrompt, ...state.messages]);

    // Este agente fala direto com LiteLLM/Groq via LangChain (bindTools exige isso — o gateway.ts
    // não transporta tool calls), então precisa logar o uso manualmente para não ficar invisível
    // no AILog como os demais agentes.
    if (response.usage_metadata) {
        await logAiUsage({
            model: response.response_metadata?.model_name
                || (response.response_metadata?.model as string | undefined)
                || 'local-llama3-fast',
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
    async run(leadId: string, sessionId?: string, instruction?: string) {
        const sid = sessionId || `session-${leadId}-${Date.now()}`;

        // instruction: nuance lapidada pelo Supervisor do enxame para esta rodada específica
        // (ex: "priorize checar situação cadastral") — antes desta correção era sempre descartada
        // e o SDR só recebia o leadId, rodando sempre com o mesmo prompt genérico.
        const humanContent = instruction
            ? `Inicie a análise e qualificação do lead com o ID: ${leadId}\n\nInstrução específica do coordenador para esta rodada: ${instruction}`
            : `Inicie a análise e qualificação do lead com o ID: ${leadId}`;

        const inputs = {
            messages: [new HumanMessage(humanContent)]
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
        await this.updateMemory(sid, messages.map((m: BaseMessage): SerializedMessage => {
            const toolCalls = (m as BaseMessage & { tool_calls?: unknown[] }).tool_calls;
            return {
                role: m.type,
                content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                toolCalls: toolCalls ? JSON.stringify(toolCalls) : undefined,
            };
        }));

        const lastMessage = messages[messages.length - 1];
        const detailedContent = lastMessage?.content ? lastMessage.content.toString() : 'Análise concluída silenciosamente.';

        return { success: true, sessionId: sid, detailedLog: detailedContent };
    }

    private async updateMemory(sessionId: string, messages: SerializedMessage[]) {
        try {
            const organizationId = getTenantId();
            const existing = await prisma.agentMemory.findFirst({
                where: { sessionId, organizationId }
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
                        organizationId,
                        messages: messages as unknown as Prisma.InputJsonValue,
                    }
                });
            }
        } catch (err) {
            logger.error({ err, sessionId }, 'Failed to update agent memory');
        }
    }
}
