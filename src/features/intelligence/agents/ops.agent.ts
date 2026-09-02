import { StateGraph, MessagesAnnotation } from '@langchain/langgraph';
import { getLeadContextTool, searchLeadsTool } from '../tools/crmTools.js';
import { searchPlaybookTool } from '../tools/playbookTool.js';
// GOV-13: as duas ferramentas de execução (`create_follow_up_task`/`notify_team`) agora vêm de
// `opsPendingActions.tool.ts`, não mais de `../tools/opsTools.js` — mesmo nome/schema visível ao
// LLM, mas em vez de executar direto elas registram uma `AIPendingAction` e a execução real só
// acontece após aprovação humana (ver `opsPendingActions.tool.ts` para o raciocínio completo).
import { createFollowUpTaskTool, notifyTeamTool } from './opsPendingActions.tool.js';
import { type BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { logger } from '../../../lib/logger.js';
import { getTenantId, getUserId } from '../../../lib/async-context.js';
import { agentMemory } from '../../../lib/ai/memory/mem0.js';
import { logAiUsage } from '../../../lib/ai/gateway.js';
import {
  SWARM_IDENTITY,
  SWARM_OUTPUT_CONTRACT,
  SWARM_UNTRUSTED_CONTENT_GUARD,
} from './swarm.constants.js';
import { assertPiiExternalConsent } from '../services/guardrails.service.js';
import { saveAgentMemory, recordAgentFailure } from './agentMemory.store.js';
import { checkpointer, ensureCheckpointerReady } from '../../../lib/ai/checkpointer.js';

// O Agente de Operações é o "braço executor" do enxame: não só analisa, ele age nas demais
// ferramentas do sistema (CRM, agenda, notificações), sempre em cima de dados reais buscados
// via get_lead_context/search_playbook — nunca inventando um leadId ou dado de empresa.
//
// GOV-13: "age" aqui significa PROPOR — `create_follow_up_task`/`notify_team` (via
// `opsPendingActions.tool.ts`) registram uma `AIPendingAction` pendente de aprovação humana, não
// executam o efeito real diretamente. Antes desta correção o Ops era o único agente do enxame
// (SDR/BDR/Closer/CRM já usam o ledger) que contornava a aprovação — ver o comentário
// `OPS_NO_LEDGER_NOTE` em `services/swarmScheduler.service.ts`, que documentava essa lacuna.
const tools = [
  searchLeadsTool,
  getLeadContextTool,
  searchPlaybookTool,
  createFollowUpTaskTool,
  notifyTeamTool,
];
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
  const tenantId = getTenantId() || 'system';
  const userId = getUserId() || 'system';

  const humanMessages = state.messages.filter(
    (m) => (typeof m.getType === 'function' && m.getType() === 'human') || m.type === 'human',
  );
  const lastHumanMessage = humanMessages[humanMessages.length - 1];
  const query =
    lastHumanMessage && typeof lastHumanMessage.content === 'string'
      ? lastHumanMessage.content
      : 'operação';

  const memories = await agentMemory.search(query, {
    userId: `${tenantId}:${userId}`,
    agentId: 'ops',
  });

  const memoryContext = agentMemory.formatForPrompt(memories);
  const systemPrompt = new SystemMessage(
    `${SWARM_IDENTITY} Você é o Agente de Operações (Ops): PROPÕE ações concretas nas ferramentas do sistema a partir de uma instrução, nunca apenas descreve o que deveria ser feito — mas, assim como os demais agentes do enxame (SDR/BDR/Closer/CRM), toda ação com efeito real fica pendente de aprovação humana antes de ser executada de fato; você mesmo nunca envia/cria nada diretamente.

DIRETRIZES DE EXECUÇÃO:
1. Se a instrução já vier com um Lead ID (informado explicitamente na mensagem), use 'get_lead_context' para confirmar os dados reais antes de agir — nunca invente nome de empresa, contato ou histórico.
2. Se a instrução mencionar uma empresa, contato ou lead PELO NOME (sem um ID pronto), use 'search_leads' primeiro para localizar o(s) lead(s) correspondente(s) — nunca recuse a missão só porque não veio um ID explícito. Se 'search_leads' retornar exatamente um resultado, use o ID retornado normalmente. Se retornar mais de um, peça esclarecimento indicando as opções. Se não retornar nada, explique o motivo e encerre.
3. Se faltar critério ou regra de negócio (ex: quando agendar follow-up, o que vale um alerta), use 'search_playbook'.
4. Para propor um lembrete/tarefa de acompanhamento, use 'create_follow_up_task' com uma data ISO 8601 concreta e um leadId real — isto registra uma proposta pendente, não cria a tarefa imediatamente.
5. Para propor um alerta à equipe comercial sobre um risco, oportunidade ou resultado importante, use 'notify_team' — isto também registra uma proposta pendente, não envia a notificação imediatamente.
6. Encerre sempre com uma síntese clara da ação PROPOSTA (ex: tarefa/notificação registrada e aguardando aprovação humana), detalhando responsável, prazo e objetivo — nunca diga que a ação já foi executada/enviada/criada. ${SWARM_OUTPUT_CONTRACT}

${memoryContext}\n\n${SWARM_UNTRUSTED_CONTENT_GUARD}`,
  );

  const startTime = Date.now();
  const response = await getModelWithTools().invoke([systemPrompt, ...state.messages]);

  if (response.usage_metadata) {
    await logAiUsage({
      model:
        response.response_metadata?.model_name ||
        (response.response_metadata?.model as string | undefined) ||
        'local-llama3-fast',
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
    !lastMessage ||
    typeof (lastMessage as BaseMessage & { tool_calls?: unknown[] }).tool_calls === 'undefined' ||
    ((lastMessage as BaseMessage & { tool_calls?: unknown[] }).tool_calls?.length ?? 0) === 0
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

    // SEC-013c: verifica base legal LGPD sempre, mesmo sem leadId — diferente dos demais
    // agentes do enxame, o Ops também tem acesso a `search_leads` (ver DIRETRIZES DE EXECUÇÃO
    // #2 no prompt abaixo), que localiza lead(s) por nome de empresa/contato SEM precisar de um
    // ID pronto. Uma missão como "notifique o time sobre a empresa X" nunca chega com leadId,
    // mas ainda assim aciona search_leads/get_lead_context e traz contato(s) reais para dentro
    // do loop de tool-calling com o provedor de IA externo (Groq/OpenAI) — mesmo mascarado via
    // minimizePii, ainda é tratamento de dado pessoal e exige base legal registrada (ver o
    // comentário sobre minimizePii vs. o gate em guardrails.service.ts). Restringir a checagem a
    // `if (leadId)` deixava esse caminho sem nenhuma verificação.
    try {
      assertPiiExternalConsent(organizationId);
    } catch (error) {
      const message = (error as Error).message;
      logger.warn(
        { err: error, leadId, organizationId },
        'Ops Agent bloqueado: sem base legal LGPD registrada para enviar dado pessoal a provedor de IA externo.',
      );
      await recordAgentFailure({
        sessionId: sid,
        agentType: 'OPS',
        organizationId,
        errorMessage: message,
      });
      return { success: false, error: message };
    }

    const humanContent = leadId
      ? `Instrução: ${instruction}\n\nLead ID relacionado a esta missão (use-o com get_lead_context/create_follow_up_task/notify_team quando fizer sentido; não busque nem invente outro): ${leadId}`
      : `Instrução: ${instruction}\n\nNenhum Lead ID foi informado para esta missão.`;

    const inputs = { messages: [new HumanMessage(humanContent)] };
    // thread_id prefixado pelo tenant — o checkpointer é compartilhado por todas as
    // organizações do processo.
    const config = { configurable: { thread_id: `${organizationId}:${sid}` } };
    let finalState: Awaited<ReturnType<typeof app.invoke>>;

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
      logger.error(
        { err: error, sessionId: sid },
        'Failed to persist Ops agent memory after successful run',
      );
      return { success: false, error: 'Ação concluída, mas falha ao persistir o resultado.' };
    }

    const lastMessage = messages[messages.length - 1];
    const output = lastMessage?.content
      ? lastMessage.content.toString()
      : 'Ação concluída silenciosamente.';

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
