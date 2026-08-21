import { StateGraph, MessagesAnnotation } from '@langchain/langgraph';
import { getLeadContextTool, searchLeadsTool } from '../tools/crmTools.js';
import { searchPlaybookTool } from '../tools/playbookTool.js';
import { createFollowUpTaskTool, notifyTeamTool } from '../tools/opsTools.js';
import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { logger } from '../../../lib/logger.js';
import { getTenantId } from '../../../lib/async-context.js';
import { logAiUsage } from '../../../lib/ai/gateway.js';
import { SWARM_IDENTITY, SWARM_OUTPUT_CONTRACT } from './swarm.constants.js';
import { assertPiiExternalConsent } from '../services/guardrails.service.js';
import { saveAgentMemory, recordAgentFailure } from './agentMemory.store.js';
import { checkpointer, ensureCheckpointerReady } from '../../../lib/ai/checkpointer.js';

// O Agente de Operações é o "braço executor" do enxame: não só analisa, ele age nas demais
// ferramentas do sistema (CRM, agenda, notificações), sempre em cima de dados reais buscados
// via get_lead_context/search_playbook — nunca inventando um leadId ou dado de empresa.
const tools = [searchLeadsTool, getLeadContextTool, searchPlaybookTool, createFollowUpTaskTool, notifyTeamTool];
const toolNode = new ToolNode(tools);

import { buildModelWithFallbackAndTools } from './fallback.util.js';

// Lazy + memoizado: monta o cliente só no primeiro uso real (dentro de callModel), nunca na carga
// do módulo — process.env.GROQ_API_KEY lido numa const de topo de arquivo ficava congelado como
// vazio se este módulo fosse importado antes de `dotenv/config` terminar de rodar. Motor local
// (Ollama via LiteLLM) removido de propósito: processa uma completion por vez nesta máquina,
// travando o enxame inteiro por vários segundos a cada etapa. Groq é rápido e não tem esse gargalo.
let cachedModelWithTools: any = null;
function getModelWithTools() {
    if (cachedModelWithTools) return cachedModelWithTools;

    cachedModelWithTools = buildModelWithFallbackAndTools('openai/gpt-oss-20b', tools);
    return cachedModelWithTools;
}

interface SerializedMessage {
    role: string;
    content: string;
    toolCalls?: string;
}

async function callModel(state: typeof MessagesAnnotation.State) {
    const systemPrompt = new SystemMessage(
        `${SWARM_IDENTITY} Você é o Agente de Operações (Ops): EXECUTA ações concretas nas ferramentas do sistema a partir de uma instrução, nunca apenas descreve o que deveria ser feito.

DIRETRIZES DE EXECUÇÃO:
1. Se a instrução já vier com um Lead ID (informado explicitamente na mensagem), use 'get_lead_context' para confirmar os dados reais antes de agir — nunca invente nome de empresa, contato ou histórico.
2. Se a instrução mencionar uma empresa, contato ou lead PELO NOME (sem um ID pronto), use 'search_leads' primeiro para localizar o(s) lead(s) correspondente(s) — nunca recuse a missão só porque não veio um ID explícito. Se 'search_leads' retornar exatamente um resultado, use o ID retornado normalmente. Se retornar mais de um, peça esclarecimento indicando as opções. Se não retornar nada, explique o motivo e encerre.
3. Se faltar critério ou regra de negócio (ex: quando agendar follow-up, o que vale um alerta), use 'search_playbook'.
4. Para agendar um lembrete/tarefa de acompanhamento, use 'create_follow_up_task' com uma data ISO 8601 concreta e um leadId real.
5. Para alertar a equipe comercial sobre um risco, oportunidade ou resultado importante, use 'notify_team'.
6. Encerre sempre com uma síntese clara da ação executada (ex: tarefa agendada, notificação enviada), detalhando responsável, prazo e objetivo. ${SWARM_OUTPUT_CONTRACT}`,
    );

    const startTime = Date.now();
    const response = await getModelWithTools().invoke([systemPrompt, ...state.messages]);

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

// AI-002 (onda 32): checkpointer real (Postgres, compartilhado — src/lib/ai/checkpointer.ts).
const app = workflow.compile({ checkpointer });

export class OpsAgent {
    async run(instruction: string, sessionId?: string, leadId?: string) {
        const sid = sessionId || `session-ops-${Date.now()}`;
        const organizationId = getTenantId();

        // Só verifica base legal quando há um leadId real: é o caso em que get_lead_context pode
        // trazer o Contact real do lead para dentro do loop de tool-calling com o provedor de IA
        // externo. Sem leadId, a instrução é texto livre sem titular associado — ver
        // guardrails.service.ts:assertPiiExternalConsent.
        if (leadId) {
            try {
                assertPiiExternalConsent(organizationId);
            } catch (error) {
                const message = (error as Error).message;
                logger.warn({ err: error, leadId, organizationId }, 'Ops Agent bloqueado: sem base legal LGPD registrada para enviar dado pessoal a provedor de IA externo.');
                await recordAgentFailure({ sessionId: sid, agentType: 'OPS', organizationId, errorMessage: message });
                return { success: false, error: message };
            }
        }

        const humanContent = leadId
            ? `Instrução: ${instruction}\n\nLead ID relacionado a esta missão (use-o com get_lead_context/create_follow_up_task/notify_team quando fizer sentido; não busque nem invente outro): ${leadId}`
            : `Instrução: ${instruction}\n\nNenhum Lead ID foi informado para esta missão.`;

        const inputs = { messages: [new HumanMessage(humanContent)] };
        // thread_id prefixado pelo tenant — o checkpointer é compartilhado por todas as
        // organizações do processo.
        const config = { configurable: { thread_id: `${organizationId}:${sid}` } };
        let finalState;

        try {
            // AI-002 (onda 32): garante que as tabelas do checkpointer Postgres existam antes da
            // primeira invocação real deste processo — memoizado.
            await ensureCheckpointerReady();
            finalState = await app.invoke(inputs, config);
        } catch (error) {
            logger.error({ err: error, sessionId }, 'Ops Agent run failed');
            await recordAgentFailure({
                sessionId: sid,
                agentType: 'OPS',
                organizationId,
                errorMessage: 'Falha na execução do agente (grafo LangGraph).',
            });
            return { success: false, error: 'Agent execution failed' };
        }

        const messages = finalState.messages as BaseMessage[];
        const serializedMessages = messages.map((m: BaseMessage): SerializedMessage => {
            const toolCalls = (m as BaseMessage & { tool_calls?: unknown[] }).tool_calls;
            return {
                role: m.type,
                content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                toolCalls: toolCalls ? JSON.stringify(toolCalls) : undefined,
            };
        });

        try {
            await this.updateMemory(sid, serializedMessages);
        } catch (error) {
            logger.error({ err: error, sessionId: sid }, 'Failed to persist Ops agent memory after successful run');
            return { success: false, error: 'Ação concluída, mas falha ao persistir o resultado.' };
        }

        const lastMessage = messages[messages.length - 1];
        const output = lastMessage?.content ? lastMessage.content.toString() : 'Ação concluída silenciosamente.';

        return { success: true, sessionId: sid, output };
    }

    // AI-003: delega para o upsert atômico compartilhado — não engole mais erro.
    private async updateMemory(sessionId: string, messages: SerializedMessage[]) {
        await saveAgentMemory({
            sessionId,
            agentType: 'OPS',
            organizationId: getTenantId(),
            messages,
            status: 'Completed',
        });
    }
}
