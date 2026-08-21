import { StateGraph, MessagesAnnotation } from '@langchain/langgraph';
import { prisma } from '../../../lib/prisma.js';
import { getLeadContextTool, updateLeadQualificationTool } from '../tools/crmTools.js';
import { searchPlaybookTool } from '../tools/playbookTool.js';
import { marketResearchTool } from '../tools/marketResearchTool.js';
import { copywriterTool } from '../tools/copywriterTool.js';
import { summarizeLeadTool } from '../tools/summarizeLeadTool.js';
import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { logger } from '../../../lib/logger.js';
import { getTenantId, getUserId } from '../../../lib/async-context.js';
import { getLearningProfile } from './learning.agent.js';
import { logAiUsage } from '../../../lib/ai/gateway.js';
import { saveAgentMemory, recordAgentFailure } from './agentMemory.store.js';
import { checkpointer, ensureCheckpointerReady } from '../../../lib/ai/checkpointer.js';
import { SWARM_IDENTITY, SWARM_OUTPUT_CONTRACT } from './swarm.constants.js';
import { rehydratePii, assertPiiExternalConsent } from '../services/guardrails.service.js';

// As ferramentas que o SDR Autônomo tem acesso
const tools = [
    getLeadContextTool, 
    searchPlaybookTool, 
    updateLeadQualificationTool, 
    marketResearchTool,
    copywriterTool,
    summarizeLeadTool
];
const toolNode = new ToolNode(tools);

import { buildModelWithFallbackAndTools } from './fallback.util.js';

// Lazy + memoizado: monta o cliente só no primeiro uso real, nunca na carga do módulo —
// process.env.GROQ_API_KEY lido numa const de topo de arquivo ficava congelado como vazio se este
// módulo fosse importado antes de `dotenv/config` terminar de rodar. Motor local (Ollama via
// LiteLLM) removido de propósito: processa uma completion por vez nesta máquina, travando o
// enxame inteiro por vários segundos a cada etapa. Groq é rápido e não tem esse gargalo.
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
        `${SWARM_IDENTITY} Você é a IA de Pré-Vendas (SDR Autônomo) de Elite, arquitetada para qualificação cirúrgica de leads B2B no setor logístico.
Sua missão não é apenas ler dados, mas EXECUTAR UMA ANÁLISE DE RISCO LOGÍSTICO COMPLETA baseada no ICP e decidir o destino do lead no funil.

DIRETRIZES DE EXECUÇÃO:
1. USE FERRAMENTAS: Obtenha os dados do Lead com 'get_lead_context' e 'summarize_lead_history'. Nunca presuma porte ou situação cadastral sem que as ferramentas confirmem.
2. RACIOCÍNIO FRIO E IMPLACÁVEL: Analise o Fit Score (0 a 100). Se não tem fit, desqualifique sem pena. Nosso tempo é valioso.
3. SAÍDA FINAL OBRIGATÓRIA: Após compilar as evidências, USE a ferramenta 'update_lead_qualification'.
   - A nota deve refletir a realidade crua dos dados.
   - O status deve ser 'Reuniao_Agendada' APENAS para leads Quentes (nota > 75) E com decisor mapeado. Caso contrário 'Qualificacao_SDR' ou 'Lead_Desqualificado'.
4. COPY AUTOMÁTICA: Se o lead for qualificado, USE 'generate_cold_email_copy' para deixar um template pronto de email para o Closer.
5. SÍNTESE DO SDR (O Resumo Matador): Depois de todas as ações de sistema, encerre com um briefing comercial com FORMATAÇÃO PREMIUM (Obrigatório o uso de Markdown, Emojis, e separadores).

**ESTRUTURA DO SEU OUTPUT FINAL:**

### ⚡ Veredito SDR
- **Decisão:** [Avançar / Arquivar / Nutrir]
- **Por que:** [1 frase objetiva explicando o porquê]

---

### 🔍 Radar de Oportunidade
- **Pontos Fortes (🟢):** [O que tem de bom neste lead?]
- **Gargalos (🔴):** [O que falta? Ex: sem decisor claro]

---

### 🛡️ Objeção vs. Contorno
**Se disserem:** "[Objeção clássica do setor]"
**Técnica de Contorno:**
> "[Como o SDR deve responder para manter a conversa viva]"

---

### 🎯 Próximo Passo Exato e Ações
[O que o BDR ou Closer deve fazer nos próximos 5 minutos?]
*(Nota: O histórico foi resumido e uma Copy de E-mail foi gerada e salva no sistema para uso imediato).*

Trabalhe silenciosamente e não faça perguntas ao usuário. Aja até completar a tarefa chamando 'update_lead_qualification'. ${SWARM_OUTPUT_CONTRACT}`
        + (learnedStyle ? `\n\nEstilo aprendido do usuário (aplique como preferência de tom):\n${learnedStyle}` : '')
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

// AI-002 (onda 32): checkpointer real (Postgres, compartilhado — src/lib/ai/checkpointer.ts),
// não mais MemorySaver em RAM. `ensureCheckpointerReady()` é chamado antes de `app.invoke()` em
// `run()`, não aqui no boot do módulo (setup é assíncrono; compile() continua síncrono).
const app = workflow.compile({ checkpointer });

export class SDRQualificationAgent {
    async run(leadId: string, sessionId?: string, instruction?: string) {
        const sid = sessionId || `session-${leadId}-${Date.now()}`;

        // Este agente busca o Contact real do lead via get_lead_context e o envia (minimizado, mas
        // ainda pseudonimizado — reversível) a um provedor de IA externo. Ponto único de
        // verificação de base legal, antes de qualquer chamada ao modelo — ver guardrails.service.ts.
        const organizationId = getTenantId();
        try {
            assertPiiExternalConsent(organizationId);
        } catch (error) {
            const message = (error as Error).message;
            logger.warn({ err: error, leadId, organizationId }, 'SDR Agent bloqueado: sem base legal LGPD registrada para enviar dado pessoal a provedor de IA externo.');
            // AI-003: sem isto, nenhuma linha de AgentMemory era gravada aqui — GET /agents/sdr/status
            // reportava "pending" para sempre em vez de "failed", indistinguível de uma execução
            // ainda em andamento.
            await recordAgentFailure({ sessionId: sid, agentType: 'SDR', organizationId, errorMessage: message });
            return { success: false, error: message };
        }

        // instruction: nuance lapidada pelo Supervisor do enxame para esta rodada específica
        // (ex: "priorize checar situação cadastral") — antes desta correção era sempre descartada
        // e o SDR só recebia o leadId, rodando sempre com o mesmo prompt genérico.
        const humanContent = instruction
            ? `Inicie a análise e qualificação do lead com o ID: ${leadId}\n\nInstrução específica do coordenador para esta rodada: ${instruction}`
            : `Inicie a análise e qualificação do lead com o ID: ${leadId}`;

        const inputs = {
            messages: [new HumanMessage(humanContent)]
        };

        // thread_id prefixado pelo tenant (AI-002, onda 20): o checkpointer é compartilhado por
        // TODAS as organizações do processo — sem isto, um `sessionId` coincidente entre duas
        // organizações reaproveitaria o checkpoint de outra.
        const config = { configurable: { thread_id: `${organizationId}:${sid}` } };
        let finalState;

        try {
            // AI-002 (onda 32): garante que as tabelas do checkpointer Postgres existam antes da
            // primeira invocação real deste processo — memoizado, não recalcula depois da primeira vez.
            await ensureCheckpointerReady();
            // Invoca o gráfico (state machine) com checkpointer ativado para manter histórico na thread.
            finalState = await app.invoke(inputs, config);
        } catch (error) {
            logger.error({ err: error, leadId, sessionId }, 'SDR Agent run failed');
            await recordAgentFailure({
                sessionId: sid,
                agentType: 'SDR',
                organizationId,
                errorMessage: 'Falha na execução do agente (grafo LangGraph).',
            });
            return { success: false, error: 'Agent execution failed' };
        }

        const messages = finalState.messages as BaseMessage[];

        // SEC-013b (continuação): get_lead_context troca o nome real do contato pelo token
        // '[NOME_DO_CONTATO]' antes de entrar no loop multi-turn do LLM (crmTools.ts) — sem esta
        // reidratação, o token cru podia vazar no resumo de qualificação mostrado ao vendedor
        // sempre que o modelo ecoasse o texto da ferramenta de volta na resposta final.
        const contactName = await this.getContactName(leadId);
        const rehydrate = (text: string) => (contactName
            ? rehydratePii(text, [{ token: '[NOME_DO_CONTATO]', value: contactName }])
            : text);

        // Persistindo no nosso banco relacional de memória a longo prazo (AgentMemory)
        const serializedMessages = messages.map((m: BaseMessage): SerializedMessage => {
            const toolCalls = (m as BaseMessage & { tool_calls?: unknown[] }).tool_calls;
            const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
            return {
                role: m.type,
                content: rehydrate(content),
                toolCalls: toolCalls ? JSON.stringify(toolCalls) : undefined,
            };
        });

        try {
            await this.updateMemory(sid, serializedMessages);
        } catch (error) {
            // AI-003: reportar sucesso aqui seria mentir — a qualificação rodou, mas o resultado
            // nunca ficou disponível para quem está fazendo polling em
            // GET /agents/sdr/status/:sessionId (o único jeito de consultar o resultado desta
            // execução assíncrona).
            logger.error({ err: error, leadId, sessionId: sid }, 'Failed to persist SDR agent memory after successful run');
            return { success: false, error: 'Qualificação concluída, mas falha ao persistir o resultado.' };
        }

        const lastMessage = messages[messages.length - 1];
        const rawDetailedContent = lastMessage?.content ? lastMessage.content.toString() : 'Análise concluída silenciosamente.';
        const detailedContent = rehydrate(rawDetailedContent);

        return { success: true, sessionId: sid, detailedLog: detailedContent };
    }

    private async getContactName(leadId: string): Promise<string | null> {
        const organizationId = getTenantId();
        if (!organizationId) return null;
        const lead = await prisma.lead.findFirst({
            where: { id: leadId, organizationId },
            select: { contact: { select: { name: true } } },
        });
        return lead?.contact?.name ?? null;
    }

    // AI-003: delega para o upsert atômico compartilhado — não engole mais erro, o chamador
    // (`run()`) decide o que fazer quando a persistência falha.
    private async updateMemory(sessionId: string, messages: SerializedMessage[]) {
        await saveAgentMemory({
            sessionId,
            agentType: 'SDR',
            organizationId: getTenantId(),
            messages,
            status: 'Completed',
        });
    }
}
