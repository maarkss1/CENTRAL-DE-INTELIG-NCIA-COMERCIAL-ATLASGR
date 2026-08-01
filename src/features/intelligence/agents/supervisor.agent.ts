import { StateGraph, Annotation, MemorySaver } from '@langchain/langgraph';
import { BaseMessage, AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { getAiModel } from '../../../lib/ai/gateway.js';
import { SDRQualificationAgent } from './sdr.agent.js';
import { BDRAgent } from './bdr.agent.js';
import { CRMAgent } from './crm.agent.js';
import { logger } from '../../../lib/logger.js';

export type SwarmAgentKey = 'sdr' | 'bdr' | 'crm';
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

const AGENT_INFO: Record<SwarmAgentKey, { label: string; description: string }> = {
    sdr: {
        label: 'SDR Autônomo',
        description: 'Qualifica leads B2B (fit logístico, porte de frota/faturamento, situação cadastral) e atualiza o status de qualificação no CRM.',
    },
    bdr: {
        label: 'BDR (Outbound)',
        description: 'Avalia o fit outbound de um lead/empresa e sugere a melhor linha de abordagem ou e-mail frio para o primeiro contato.',
    },
    crm: {
        label: 'Gestor de CRM',
        description: 'Resume o risco de perda de negócios/deals em andamento e recomenda a próxima ação concreta de tratativa.',
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

function extractJsonBlock(text: string): unknown {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
        return JSON.parse(match[0]);
    } catch {
        return null;
    }
}

// Exportado só para teste unitário direto da validação de forma da decisão do supervisor.
export const supervisorDecisionSchema = z.object({
    action: z.enum(['sdr', 'bdr', 'crm', 'finish']),
    instruction: z.string().default(''),
    reasoning: z.string().default(''),
});

type SupervisorDecision = z.infer<typeof supervisorDecisionSchema>;

function fallbackDecision(completed: SwarmAgentKey[]): SupervisorDecision {
    const order: SwarmAgentKey[] = ['sdr', 'bdr', 'crm'];
    const pending = order.find((agent) => !completed.includes(agent));
    if (!pending) {
        return { action: 'finish', instruction: '', reasoning: 'Todos os especialistas relevantes já atuaram.' };
    }
    return {
        action: pending,
        instruction: 'Analise a missão do usuário com os dados disponíveis e produza um resultado objetivo.',
        reasoning: 'Roteamento sequencial de contingência (resposta do supervisor não pôde ser interpretada).',
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

    const systemPrompt = `Você é o Supervisor de um Enxame (Swarm) de Agentes de Inteligência Comercial da Atlas.
Você coordena 3 especialistas e decide, a cada rodada, qual deve atuar a seguir (ou se a missão está concluída):
${(Object.entries(AGENT_INFO) as [SwarmAgentKey, { label: string; description: string }][])
    .map(([key, info]) => `- '${key}' (${info.label}): ${info.description}`)
    .join('\n')}

Missão original do usuário:
"""${state.mission}"""

Especialistas já acionados nesta missão: ${completedList}.
Resultados produzidos até agora:
${resultsSummary}

Decida o próximo passo. Não repita um especialista que já respondeu de forma satisfatória, a não ser que haja uma lacuna clara que só ele resolve.
Se a missão já foi suficientemente atendida pelos especialistas já acionados, responda 'finish'.
Responda APENAS com um objeto JSON válido, sem markdown e sem texto fora do JSON, no formato exato:
{"action": "sdr" | "bdr" | "crm" | "finish", "instruction": "instrução objetiva e específica em português para o especialista escolhido (string vazia se action for finish)", "reasoning": "uma frase curta explicando a decisão"}`;

    let decision: SupervisorDecision;
    try {
        const model = getAiModel('gemini-flash', 0, 'supervisor-agent');
        const response = await model.invoke([
            new SystemMessage(systemPrompt),
            new HumanMessage('Qual é o próximo passo?'),
        ]);
        const parsed = supervisorDecisionSchema.safeParse(extractJsonBlock(response.content));
        decision = parsed.success ? parsed.data : fallbackDecision(state.completed);
    } catch (error) {
        logger.error({ err: error }, 'Swarm supervisor routing failed, using fallback heuristic');
        decision = fallbackDecision(state.completed);
    }

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
    const instruction = state.instruction || state.mission;
    try {
        const agent = new SDRQualificationAgent();
        const result = await agent.run(instruction, `swarm-sdr-${state.step}`);
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
        const model = getAiModel('gemini-flash', 0.2, 'supervisor-synthesis');
        const response = await model.invoke([
            new SystemMessage(
                'Você é o Supervisor do Enxame de Agentes da Atlas. Com base na missão do usuário e nos resultados retornados pelos especialistas, escreva uma resposta final única, direta e acionável em português do Brasil, sem markdown, resumindo o que foi feito e quais são os próximos passos recomendados. Baseie-se SOMENTE nas informações fornecidas; não invente dados novos.',
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
    .addNode('finish', finishNode)
    .addEdge('__start__', 'supervisor')
    .addConditionalEdges('supervisor', routerCondition, {
        sdr: 'sdr',
        bdr: 'bdr',
        crm: 'crm',
        finish: 'finish',
    })
    .addEdge('sdr', 'supervisor')
    .addEdge('bdr', 'supervisor')
    .addEdge('crm', 'supervisor')
    .addEdge('finish', '__end__');

const memory = new MemorySaver();
const swarmApp = workflow.compile({ checkpointer: memory });

export class SwarmOrchestrator {
    async executeMission(mission: string, sessionId?: string) {
        const sid = sessionId || `swarm-mission-${Date.now()}`;
        const config = { configurable: { thread_id: sid }, recursionLimit: 25 };

        try {
            const finalState = await swarmApp.invoke({ messages: [new HumanMessage(mission)], mission }, config);
            return finalState.messages as BaseMessage[];
        } catch (error) {
            logger.error({ err: error, sessionId: sid }, 'Swarm execution failed');
            throw error;
        }
    }

    async executeMissionStream(mission: string, sessionId: string, onChunk: (event: SwarmEvent) => void) {
        const sid = sessionId || `swarm-mission-${Date.now()}`;
        const config = { configurable: { thread_id: sid }, recursionLimit: 25 };

        try {
            const stream = await swarmApp.stream({ messages: [new HumanMessage(mission)], mission }, config);

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
