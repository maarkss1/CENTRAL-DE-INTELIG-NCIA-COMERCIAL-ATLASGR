import { StateGraph, Annotation, MemorySaver } from '@langchain/langgraph';
import { BaseMessage, AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { getAiModel, logAiUsage } from '../../../lib/ai/gateway.js';
import { SDRQualificationAgent } from './sdr.agent.js';
import { BDRAgent } from './bdr.agent.js';
import { CRMAgent } from './crm.agent.js';
import { OpsAgent } from './ops.agent.js';
import { logger } from '../../../lib/logger.js';
import { SWARM_IDENTITY, SWARM_OUTPUT_CONTRACT } from './swarm.constants.js';

// Lazy + memoizado: monta o cliente só no primeiro uso real, nunca na carga do módulo —
// process.env.GROQ_API_KEY lido numa const de topo de arquivo ficava congelado como vazio se este
// módulo fosse importado antes de `dotenv/config` terminar de rodar. Motor local (Ollama via
// LiteLLM) removido de propósito: processa uma completion por vez nesta máquina, travando o
// roteamento do enxame inteiro por vários segundos a cada decisão. Groq é rápido e não tem esse
// gargalo. Usar ChatOpenAI "cru" (em vez do wrapper AiChatModel do gateway) é o que habilita
// tool-calling/structured output — o wrapper só devolve texto livre, e a decisão de roteamento
// precisa ser JSON confiável.
let cachedSupervisorLlm: ChatOpenAI | null = null;
function getSupervisorLlm() {
    if (cachedSupervisorLlm) return cachedSupervisorLlm;

    cachedSupervisorLlm = new ChatOpenAI({
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
            baseURL: 'https://api.groq.com/openai/v1',
        },
    });
    return cachedSupervisorLlm;
}

export type SwarmAgentKey = 'sdr' | 'bdr' | 'crm' | 'ops';
export type SwarmRoute = SwarmAgentKey | 'finish';
export type SwarmEventType = 'routing' | 'agent_result' | 'agent_error' | 'final';

export interface SwarmEvent {
    type: SwarmEventType;
    agent: 'supervisor' | SwarmAgentKey;
    content: string;
    step: number;
    reasoning?: string;
    /** Presente apenas em eventos 'routing': qual especialista está prestes a ser acionado. */
    nextAgent?: SwarmAgentKey;
}

// Limite de saltos entre especialistas antes de forçar a síntese final (evita loops infinitos).
const MAX_STEPS = 4;

const AGENT_INFO: Record<SwarmAgentKey, { label: string; description: string; chooseWhen: string }> = {
    sdr: {
        label: 'SDR Autônomo',
        description: 'Qualifica um lead JÁ CADASTRADO no CRM (fit logístico, porte de frota/faturamento, situação cadastral) e atualiza o status de qualificação.',
        chooseWhen: 'A missão pede para qualificar/analisar um lead específico que já existe no CRM. Exige um Lead ID real — nunca escolha sem um.',
    },
    bdr: {
        label: 'BDR (Outbound)',
        description: 'Avalia o fit outbound de um lead/empresa a partir de um resumo em texto (não precisa de cadastro no CRM) e sugere a linha de abordagem para o primeiro contato frio.',
        chooseWhen: 'A missão é sobre um lead/empresa NOVO, ainda sem contato feito, ou pede uma sugestão de abertura/primeira mensagem de prospecção.',
    },
    crm: {
        label: 'Gestor de CRM',
        description: 'Resume o risco de perda de negócios/deals JÁ EM ANDAMENTO e recomenda a próxima ação concreta de tratativa.',
        chooseWhen: 'A missão é sobre uma negociação/deal que já está em andamento (não um lead novo) — risco de estagnação ou perda, próximos passos comerciais.',
    },
    ops: {
        label: 'Agente de Operações',
        description: 'Executa ações concretas nas demais ferramentas do sistema: agenda tarefas de follow-up no CRM e notifica a equipe comercial.',
        chooseWhen: 'A missão pede uma AÇÃO CONCRETA a ser executada agora (agendar, notificar, criar tarefa) — não escolha só para produzir mais uma análise ou opinião.',
    },
};

const SwarmState = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
        reducer: (left, right) => left.concat(right),
        default: () => [],
    }),
    mission: Annotation<string>({
        reducer: (left, right) => right ?? left,
        default: () => '',
    }),
    instruction: Annotation<string>({
        reducer: (left, right) => right ?? left,
        default: () => '',
    }),
    // ID real de Lead do CRM, opcional — ver sdrNode: sem isto, SDRQualificationAgent.run() recebia
    // o texto livre da missão/instrução no lugar de um ID de lead de verdade e a ferramenta de
    // contexto sempre falhava com "lead não encontrado" (IA-003).
    leadId: Annotation<string>({
        reducer: (left, right) => right ?? left,
        default: () => '',
    }),
    next: Annotation<SwarmRoute>({
        reducer: (left, right) => right ?? left,
        default: () => 'sdr',
    }),
    completed: Annotation<SwarmAgentKey[]>({
        reducer: (left, right) => [...left, ...right],
        default: () => [],
    }),
    results: Annotation<Partial<Record<SwarmAgentKey, string>>>({
        reducer: (left, right) => ({ ...left, ...right }),
        default: () => ({}),
    }),
    step: Annotation<number>({
        reducer: (left, right) => right ?? left,
        default: () => 0,
    }),
});

type SwarmStateType = typeof SwarmState.State;

function buildEvent(
    type: SwarmEventType,
    agent: SwarmEvent['agent'],
    content: string,
    step: number,
    reasoning?: string,
    nextAgent?: SwarmAgentKey,
): SwarmEvent {
    return { type, agent, content, step, reasoning, nextAgent };
}

function toAiMessage(event: SwarmEvent): AIMessage {
    return new AIMessage({ content: event.content, additional_kwargs: { swarmEvent: event } });
}

// Exportado só para teste unitário direto da validação de forma da decisão do supervisor.
export const supervisorDecisionSchema = z.object({
    action: z.enum(['sdr', 'bdr', 'crm', 'ops', 'finish']).describe(
        'Qual especialista deve atuar a seguir, ou "finish" se a missão já foi suficientemente atendida.',
    ),
    instruction: z.string().default('').describe(
        'Instrução objetiva e ESPECÍFICA em português para o especialista escolhido: diga exatamente o que analisar/fazer e com base em que dado da missão. String vazia se action for "finish".',
    ),
    reasoning: z.string().default('').describe('Uma frase curta explicando por que este especialista (e não outro) foi escolhido agora.'),
});

type SupervisorDecision = z.infer<typeof supervisorDecisionSchema>;

// Exportado só para teste unitário direto do roteamento de contingência. Recebe a missão original
// para usar como instrução de contingência — antes disto, todo fallback (parsing falhou, guard
// interceptou) mandava um texto fixo e genérico pro especialista ("produza um resultado
// objetivo"), descartando o pedido real do usuário justamente nos casos em que o roteamento por
// IA não pôde ser confiado.
export function fallbackDecision(completed: SwarmAgentKey[], hasLeadId: boolean, mission: string = ''): SupervisorDecision {
    // Sem leadId o especialista 'sdr' sempre falharia (depende de um lead real do CRM) — nem
    // oferece ele como opção de contingência, senão o enxame queima uma rodada inteira só para
    // descobrir isso (ver enforceLeadGuard, que cobre o mesmo caso quando é o LLM que erra).
    const order: SwarmAgentKey[] = hasLeadId ? ['sdr', 'bdr', 'crm', 'ops'] : ['bdr', 'crm', 'ops'];
    const pending = order.find((agent) => !completed.includes(agent));
    if (!pending) {
        return { action: 'finish', instruction: '', reasoning: 'Todos os especialistas relevantes já atuaram.' };
    }
    return {
        action: pending,
        instruction: mission.trim() || 'Analise a missão do usuário com os dados disponíveis e produza um resultado objetivo.',
        reasoning: 'Roteamento sequencial de contingência (resposta do supervisor não pôde ser interpretada).',
    };
}

// Trava determinística: nunca aciona o Agente SDR sem um leadId real, mesmo que o LLM do
// supervisor "esqueça" a instrução do prompt e escolha 'sdr' de qualquer forma — sdrNode
// dependeria de get_lead_context com um ID que não existe e queimaria uma rodada inteira do
// enxame só para produzir o mesmo erro que dava pra prever aqui. Exportado para teste unitário.
export function enforceLeadGuard(
    decision: SupervisorDecision,
    context: Pick<SwarmStateType, 'leadId' | 'completed' | 'mission'>,
): SupervisorDecision {
    if (decision.action !== 'sdr' || context.leadId) {
        return decision;
    }
    const rerouted = fallbackDecision(context.completed, false, context.mission);
    const note = 'SDR não pode ser acionado: nenhum leadId foi informado para esta missão.';
    return {
        ...rerouted,
        reasoning: rerouted.reasoning ? `${note} ${rerouted.reasoning}` : note,
    };
}

async function supervisorNode(state: SwarmStateType) {
    const step = state.step + 1;

    if (step > MAX_STEPS) {
        const reasoning = `Limite de ${MAX_STEPS} etapas do enxame atingido.`;
        return {
            step,
            next: 'finish' as const,
            instruction: '',
            messages: [toAiMessage(buildEvent('routing', 'supervisor', `Encerrando o roteamento: ${reasoning} Preparando síntese final.`, step, reasoning, undefined))],
        };
    }

    const completedList = state.completed.length > 0
        ? state.completed.map((agent) => AGENT_INFO[agent].label).join(', ')
        : 'nenhum ainda';
    const resultsSummary = (Object.entries(state.results) as [SwarmAgentKey, string][])
        .map(([agent, content]) => `- ${AGENT_INFO[agent].label}: ${content.slice(0, 400)}`)
        .join('\n') || 'Nenhum resultado produzido até agora.';

    // Derivado de AGENT_INFO (não hardcoded) — um especialista novo adicionado ali aparece aqui
    // automaticamente.
    const agentKeys = Object.keys(AGENT_INFO) as SwarmAgentKey[];

    const leadContextLine = state.leadId
        ? `Lead ID disponível para esta missão: ${state.leadId} (o especialista 'sdr' pode usá-lo).`
        : `Nenhum Lead ID foi informado para esta missão — NÃO escolha 'sdr' enquanto isso não mudar, pois ele depende de um lead real do CRM e sempre falharia sem um ID.`;

    const systemPrompt = `${SWARM_IDENTITY} Você é o Supervisor: coordena ${agentKeys.length} especialistas e decide, a cada rodada, qual deve atuar a seguir (ou se a missão está concluída):
${(Object.entries(AGENT_INFO) as [SwarmAgentKey, { label: string; description: string; chooseWhen: string }][])
    .map(([key, info]) => `- '${key}' (${info.label}): ${info.description}\n  Escolha quando: ${info.chooseWhen}`)
    .join('\n')}

Missão original do usuário:
"""${state.mission}"""

${leadContextLine}

Especialistas já acionados nesta missão: ${completedList}.
Resultados produzidos até agora:
${resultsSummary}

Decida o próximo passo usando a ferramenta de decisão de roteamento. Escolha o especialista cujo critério "Escolha quando" bate com a missão — se mais de um parecer plausível, prefira o mais específico. Não repita um especialista que já respondeu de forma satisfatória, a não ser que haja uma lacuna clara que só ele resolve.
A instrução que você escrever para o especialista deve ser objetiva, caber em 1 a 2 frases e citar o dado concreto da missão que ele precisa usar — nunca escreva uma instrução genérica como "analise os dados disponíveis", e nunca a deixe vazia a menos que a ação seja 'finish'.
Se a missão já foi suficientemente atendida pelos especialistas já acionados, escolha 'finish'.`;

    let decision: SupervisorDecision;
    const startTime = Date.now();
    try {
        // withStructuredOutput usa tool-calling nativo do provedor em vez de pedir JSON em texto
        // livre e extrair na mão — antes, uma resposta do modelo com qualquer chave extra ou texto
        // fora do JSON (comum em modelos pequenos como o llama-3.1-8b-instant usado aqui) quebrava
        // o regex de extração e o roteamento sempre caía no fallback heurístico, mesmo quando o
        // modelo tinha decidido corretamente.
        const structuredModel = getSupervisorLlm()
            .withStructuredOutput(supervisorDecisionSchema, { name: 'route_decision', includeRaw: true });

        const result = await structuredModel.invoke([
            new SystemMessage(systemPrompt),
            new HumanMessage('Qual é o próximo passo?'),
        ]);
        const raw = result.raw as AIMessage;

        const usage = raw?.usage_metadata;
        if (usage) {
            await logAiUsage({
                model: (raw.response_metadata?.model_name as string | undefined)
                    || (raw.response_metadata?.model as string | undefined)
                    || 'local-llama3-fast',
                usage: {
                    totalTokens: usage.total_tokens,
                    promptTokens: usage.input_tokens,
                    completionTokens: usage.output_tokens,
                },
                latencyMs: Date.now() - startTime,
            });
        }

        if (!result.parsed) {
            throw new Error('Supervisor não retornou uma decisão estruturada válida.');
        }
        // Reaplica o schema: o tipo inferido do tool-calling trata os campos com .default() como
        // opcionais (a volta por JSON Schema perde essa informação), então isto garante em runtime
        // que instruction/reasoning nunca ficam undefined mesmo se o modelo omitir a chave.
        decision = supervisorDecisionSchema.parse(result.parsed);
    } catch (error) {
        logger.error({ err: error }, 'Swarm supervisor routing failed, using fallback heuristic');
        decision = fallbackDecision(state.completed, Boolean(state.leadId), state.mission);
    }
    // Backstop determinístico: mesmo se o LLM ignorar a linha acima e escolher 'sdr' sem leadId.
    decision = enforceLeadGuard(decision, state);

    const content = decision.action === 'finish'
        ? `Missão avaliada como concluída. ${decision.reasoning}`.trim()
        : `Encaminhando para ${AGENT_INFO[decision.action as SwarmAgentKey].label}: ${decision.instruction}`;

    return {
        step,
        next: decision.action,
        instruction: decision.instruction,
        messages: [toAiMessage(buildEvent(
            'routing',
            'supervisor',
            content,
            step,
            decision.reasoning,
            decision.action === 'finish' ? undefined : decision.action,
        ))],
    };
}

// Adapters que executam os sub-agentes com a instrução lapidada pelo supervisor (não mais o texto cru do roteamento).
async function sdrNode(state: SwarmStateType) {
    // SDRQualificationAgent.run() espera um ID real de Lead do CRM (usa a ferramenta get_lead_context,
    // que faz um lookup exato por id) — nunca texto livre. Antes desta correção, este node passava
    // state.instruction (a instrução em português lapidada pelo supervisor) no lugar do leadId, e a
    // qualificação sempre falhava com "Lead não encontrado no CRM" (IA-003).
    if (!state.leadId) {
        const content = 'Não foi possível qualificar: nenhum lead foi informado para esta missão. Informe o ID do lead relacionado para que o Agente SDR busque o contexto real no CRM.';
        return {
            completed: ['sdr'] as SwarmAgentKey[],
            results: { sdr: content },
            messages: [toAiMessage(buildEvent('agent_error', 'sdr', content, state.step))],
        };
    }
    try {
        const agent = new SDRQualificationAgent();
        const result = await agent.run(state.leadId, `swarm-sdr-${state.step}`, state.instruction || undefined);
        const content = ('detailedLog' in result && result.detailedLog) ? result.detailedLog : 'Análise concluída sem detalhamento textual.';
        return {
            completed: ['sdr'] as SwarmAgentKey[],
            results: { sdr: content },
            messages: [toAiMessage(buildEvent('agent_result', 'sdr', content, state.step))],
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha desconhecida no Agente SDR.';
        logger.error({ err: error }, 'Swarm SDR node failed');
        return {
            completed: ['sdr'] as SwarmAgentKey[],
            results: { sdr: `Erro: ${message}` },
            messages: [toAiMessage(buildEvent('agent_error', 'sdr', `O Agente SDR encontrou um problema: ${message}`, state.step))],
        };
    }
}

async function bdrNode(state: SwarmStateType) {
    const instruction = state.instruction || state.mission;
    try {
        const agent = new BDRAgent();
        const result = await agent.run(instruction, `swarm-bdr-${state.step}`);
        if (result.error) {
            throw new Error(result.error);
        }
        const content = result.qualification || 'Análise concluída sem detalhamento textual.';
        return {
            completed: ['bdr'] as SwarmAgentKey[],
            results: { bdr: content },
            messages: [toAiMessage(buildEvent('agent_result', 'bdr', content, state.step))],
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha desconhecida no Agente BDR.';
        logger.error({ err: error }, 'Swarm BDR node failed');
        return {
            completed: ['bdr'] as SwarmAgentKey[],
            results: { bdr: `Erro: ${message}` },
            messages: [toAiMessage(buildEvent('agent_error', 'bdr', `O Agente BDR encontrou um problema: ${message}`, state.step))],
        };
    }
}

async function crmNode(state: SwarmStateType) {
    const instruction = state.instruction || state.mission;
    try {
        const agent = new CRMAgent();
        const result = await agent.run(instruction, `swarm-crm-${state.step}`);
        if (result.error) {
            throw new Error(result.error);
        }
        const content = result.action || 'Análise concluída sem detalhamento textual.';
        return {
            completed: ['crm'] as SwarmAgentKey[],
            results: { crm: content },
            messages: [toAiMessage(buildEvent('agent_result', 'crm', content, state.step))],
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha desconhecida no Agente de CRM.';
        logger.error({ err: error }, 'Swarm CRM node failed');
        return {
            completed: ['crm'] as SwarmAgentKey[],
            results: { crm: `Erro: ${message}` },
            messages: [toAiMessage(buildEvent('agent_error', 'crm', `O Agente de CRM encontrou um problema: ${message}`, state.step))],
        };
    }
}

async function opsNode(state: SwarmStateType) {
    const instruction = state.instruction || state.mission;
    try {
        const agent = new OpsAgent();
        const result = await agent.run(instruction, `swarm-ops-${state.step}`, state.leadId || undefined);
        if (result.error) {
            throw new Error(result.error);
        }
        const content = result.output || 'Ação concluída sem detalhamento textual.';
        return {
            completed: ['ops'] as SwarmAgentKey[],
            results: { ops: content },
            messages: [toAiMessage(buildEvent('agent_result', 'ops', content, state.step))],
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha desconhecida no Agente de Operações.';
        logger.error({ err: error }, 'Swarm Ops node failed');
        return {
            completed: ['ops'] as SwarmAgentKey[],
            results: { ops: `Erro: ${message}` },
            messages: [toAiMessage(buildEvent('agent_error', 'ops', `O Agente de Operações encontrou um problema: ${message}`, state.step))],
        };
    }
}

async function finishNode(state: SwarmStateType) {
    const resultsSummary = (Object.entries(state.results) as [SwarmAgentKey, string][])
        .map(([agent, content]) => `${AGENT_INFO[agent].label}:\n${content}`)
        .join('\n\n');

    if (!resultsSummary) {
        const content = 'Nenhum especialista precisou ser acionado para esta missão.';
        return { messages: [toAiMessage(buildEvent('final', 'supervisor', content, state.step))] };
    }

    let synthesis: string;
    try {
        const model = getAiModel('local-llama3-fast', 0.2, 'supervisor-synthesis');
        const response = await model.invoke([
            new SystemMessage(
                `${SWARM_IDENTITY} Você é o Supervisor encerrando a missão. Com base na missão do usuário e nos ` +
                'resultados retornados pelos especialistas, escreva uma síntese final única, direta e acionável ' +
                `(no máximo 5 frases), resumindo o que foi feito e quais são os próximos passos recomendados. ${SWARM_OUTPUT_CONTRACT}`,
            ),
            new HumanMessage(`Missão: ${state.mission}\n\nResultados dos especialistas:\n${resultsSummary}`),
        ]);
        synthesis = response.content.trim() || resultsSummary;
    } catch (error) {
        logger.error({ err: error }, 'Swarm synthesis failed, falling back to raw results');
        synthesis = resultsSummary;
    }

    return {
        messages: [toAiMessage(buildEvent('final', 'supervisor', synthesis, state.step))],
    };
}

function routerCondition(state: SwarmStateType): SwarmRoute {
    return state.next;
}

const workflow = new StateGraph(SwarmState)
    .addNode('supervisor', supervisorNode)
    .addNode('sdr', sdrNode)
    .addNode('bdr', bdrNode)
    .addNode('crm', crmNode)
    .addNode('ops', opsNode)
    .addNode('finish', finishNode)
    .addEdge('__start__', 'supervisor')
    .addConditionalEdges('supervisor', routerCondition, {
        sdr: 'sdr',
        bdr: 'bdr',
        crm: 'crm',
        ops: 'ops',
        finish: 'finish',
    })
    .addEdge('sdr', 'supervisor')
    .addEdge('bdr', 'supervisor')
    .addEdge('crm', 'supervisor')
    .addEdge('ops', 'supervisor')
    .addEdge('finish', '__end__');

const memory = new MemorySaver();
const swarmApp = workflow.compile({ checkpointer: memory });

export class SwarmOrchestrator {
    async executeMission(mission: string, sessionId?: string, leadId?: string) {
        const sid = sessionId || `swarm-mission-${Date.now()}`;
        const config = { configurable: { thread_id: sid }, recursionLimit: 25 };

        try {
            const finalState = await swarmApp.invoke({ messages: [new HumanMessage(mission)], mission, leadId: leadId || '' }, config);
            return finalState.messages as BaseMessage[];
        } catch (error) {
            logger.error({ err: error, sessionId: sid }, 'Swarm execution failed');
            throw error;
        }
    }

    async executeMissionStream(mission: string, sessionId: string, onChunk: (event: SwarmEvent) => void, leadId?: string) {
        const sid = sessionId || `swarm-mission-${Date.now()}`;
        const config = { configurable: { thread_id: sid }, recursionLimit: 25 };

        try {
            const stream = await swarmApp.stream({ messages: [new HumanMessage(mission)], mission, leadId: leadId || '' }, config);

            for await (const chunk of stream) {
                const nodeName = Object.keys(chunk)[0];
                const nodeData = chunk[nodeName as keyof typeof chunk] as { messages?: BaseMessage[] } | undefined;
                const msgs = nodeData?.messages;
                if (msgs && msgs.length > 0) {
                    const lastMsg = msgs[msgs.length - 1] as AIMessage;
                    const event = (lastMsg.additional_kwargs?.swarmEvent as SwarmEvent | undefined)
                        ?? buildEvent('agent_result', 'supervisor', String(lastMsg.content ?? ''), 0);
                    onChunk(event);
                }
            }
        } catch (error) {
            logger.error({ err: error, sessionId: sid }, 'Swarm stream execution failed');
            throw error;
        }
    }
}
