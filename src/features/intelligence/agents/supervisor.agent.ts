import { StateGraph, MessagesAnnotation, MemorySaver } from '@langchain/langgraph';
import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getAiModel } from '../../../lib/ai/gateway.js';
import { SDRAgent } from './sdr.agent.js';
import { BDRAgent } from './bdr.agent.js';
import { CRMAgent } from './crm.agent.js';
import { logger } from '../../../lib/logger.js';

// The routing logic of the supervisor
async function supervisorNode(state: typeof MessagesAnnotation.State) {
    const model = getAiModel('gemini-flash', 0, 'supervisor-agent');
    const systemPrompt = new SystemMessage(
        `Você é o Supervisor de Inteligência da Atlas. 
Você coordena 3 especialistas:
- 'sdr': Agente de Pré-Vendas responsável por analisar e qualificar os leads B2B logisticamente baseando-se no Playbook.
- 'bdr': Agente de Outbound responsável por analisar fit e sugerir abordagens e e-mails frios.
- 'crm': Agente responsável por resumir riscos de negócios/deals no CRM e sugerir próximos passos.

Dada a conversa e o pedido do usuário, responda APENAS com o nome do especialista que deve atuar a seguir: 'sdr', 'bdr', ou 'crm'. Se a tarefa já estiver totalmente completa ou for impossível, responda 'FINISH'.
Não adicione pontuação ou explicações. APENAS a palavra correta.`
    );
    const response = await model.invoke([systemPrompt, ...state.messages]);
    const route = response.content.trim().toLowerCase();
    
    // We add an AI message indicating the route taken for traceability.
    return { messages: [{ role: 'assistant', content: `[ROUTING] Routing task to: ${route}` }] };
}

// Adapters to run sub-agents and map their outputs back to the supervisor state
async function sdrNode(state: typeof MessagesAnnotation.State) {
    const agent = new SDRAgent();
    // Assuming the last message is the instruction
    const lastMsg = state.messages[state.messages.length - 1];
    const result = await agent.run(lastMsg.content as string, 'swarm-sdr'); // Hardcoded session for swarm context
    return { messages: [{ role: 'assistant', content: `[SDR Result]\n${result.detailedLog}` }] };
}

async function bdrNode(state: typeof MessagesAnnotation.State) {
    const agent = new BDRAgent();
    const lastMsg = state.messages[state.messages.length - 1];
    const result = await agent.run(lastMsg.content as string, 'swarm-bdr');
    return { messages: [{ role: 'assistant', content: `[BDR Result]\n${result.qualification}` }] };
}

async function crmNode(state: typeof MessagesAnnotation.State) {
    const agent = new CRMAgent();
    const lastMsg = state.messages[state.messages.length - 1];
    const result = await agent.run(lastMsg.content as string, 'swarm-crm');
    return { messages: [{ role: 'assistant', content: `[CRM Result]\n${result.action}` }] };
}

function routerCondition(state: typeof MessagesAnnotation.State) {
    const messages = state.messages;
    const lastMessage = messages[messages.length - 1];
    const content = lastMessage.content as string;

    if (content.includes('sdr')) return 'sdr';
    if (content.includes('bdr')) return 'bdr';
    if (content.includes('crm')) return 'crm';
    return '__end__';
}

const workflow = new StateGraph(MessagesAnnotation)
    .addNode('supervisor', supervisorNode)
    .addNode('sdr', sdrNode)
    .addNode('bdr', bdrNode)
    .addNode('crm', crmNode)
    .addEdge('__start__', 'supervisor')
    .addConditionalEdges('supervisor', routerCondition, {
        sdr: 'sdr',
        bdr: 'bdr',
        crm: 'crm',
        __end__: '__end__',
    })
    .addEdge('sdr', 'supervisor')
    .addEdge('bdr', 'supervisor')
    .addEdge('crm', 'supervisor');

const memory = new MemorySaver();
const swarmApp = workflow.compile({ checkpointer: memory });

export class SwarmOrchestrator {
    async executeMission(mission: string, sessionId?: string) {
        const sid = sessionId || `swarm-mission-${Date.now()}`;
        const config = { configurable: { thread_id: sid } };

        try {
            const finalState = await swarmApp.invoke(
                { messages: [new HumanMessage(mission)] },
                config
            );
            return finalState.messages as BaseMessage[];
        } catch (error) {
            logger.error({ err: error, sessionId: sid }, 'Swarm execution failed');
            throw error;
        }
    }
}
