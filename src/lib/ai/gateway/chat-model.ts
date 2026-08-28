/**
 * Orquestrador do gateway de chat: aplica a política de orçamento (../budget.ts), percorre a
 * cadeia de fallback entre adapters de provedor (providers/*.provider.ts) e, só depois de ter uma
 * resposta, dispara custo (../metrics.ts) e trace (telemetry.ts). Nenhuma lógica de
 * provedor/retry/circuit-breaker mora aqui — só composição. Trocar a ordem de fallback, adicionar
 * um provedor novo, ou trocar a política de orçamento nunca deve exigir tocar nos outros módulos.
 */
import type { BaseMessage } from '@langchain/core/messages';
import { requestContext } from '../../async-context.js';
import { assertAiBudgetNotExceeded } from '../budget.js';
import { recordAiUsageCost } from '../metrics.js';
import { resolveFallbackTimeoutMs } from './http-client.js';
import { resolveModelName } from './model-routing.js';
import { estimateCostUsd } from './pricing.js';
import { toChatCompletionMessages } from './parsing.js';
import { sanitizeProviderMessage } from './redaction.js';
import { traceAiGeneration } from './telemetry.js';
import { groqProvider } from './providers/groq.provider.js';
import { openaiProvider } from './providers/openai.provider.js';
import { litellmProvider } from './providers/litellm.provider.js';
import type { ProviderAdapter } from './providers/types.js';
import type { AiChatModel, AiInvokeResult, ChatCompletionResponse } from './types.js';

// Ordem de fallback: Groq primeiro (rápido, sem o gargalo de concorrência do modelo local),
// OpenAI como segunda opção só se configurado, LiteLLM/Ollama por último (ver comentário em
// providers/litellm.provider.ts sobre por que ele nunca deve ser a primeira tentativa).
const PROVIDER_CHAIN: readonly ProviderAdapter[] = [groqProvider, openaiProvider, litellmProvider];

function buildExhaustedProvidersError(errorsByProvider: Map<string, unknown>): Error {
  const configuredNames: Record<string, string> = {
    groq: 'Groq',
    openai: 'OpenAI',
    litellm: 'Ollama/LiteLLM',
  };
  const configured = PROVIDER_CHAIN.filter((provider) => provider.isConfigured())
    .map((provider) => configuredNames[provider.name])
    .join(', ');

  if (!configured) {
    return new Error(
      'Nenhum motor de IA configurado. Defina GROQ_API_KEY (gratuito, console.groq.com) ou OPENAI_API_KEY no .env.',
    );
  }

  const groqMessage = sanitizeProviderMessage(describeError(errorsByProvider.get('groq')));
  const openaiMessage = sanitizeProviderMessage(describeError(errorsByProvider.get('openai')));
  const litellmMessage = sanitizeProviderMessage(describeError(errorsByProvider.get('litellm')));
  return new Error(
    `Os motores de IA estão indisponíveis (${configured}). Groq: ${groqMessage}. OpenAI: ${openaiMessage}. LiteLLM: ${litellmMessage}`,
  );
}

function describeError(error: unknown): unknown {
  return error instanceof Error ? error.message : error;
}

/**
 * Percorre a cadeia de fallback na ordem definida, pulando provedores não configurados, e retorna
 * a primeira resposta bem-sucedida com o nome do provedor que a produziu. Lança um erro agregado
 * (uma linha por provedor tentado) se todos falharem.
 */
async function callWithFallback(
  resolvedModel: string,
  requestMessages: ReturnType<typeof toChatCompletionMessages>,
  temperature: number,
  agentContext: string,
): Promise<{ response: ChatCompletionResponse; providerUsed: string }> {
  const timeoutMs = resolveFallbackTimeoutMs();
  const errorsByProvider = new Map<string, unknown>();

  for (const provider of PROVIDER_CHAIN) {
    if (!provider.isConfigured()) continue;
    try {
      const response = await provider.chatCompletion({
        messages: requestMessages,
        temperature,
        agentContext,
        resolvedModel,
        timeoutMs,
      });
      return { response, providerUsed: provider.name };
    } catch (error) {
      errorsByProvider.set(provider.name, error);
    }
  }

  throw buildExhaustedProvidersError(errorsByProvider);
}

/**
 * Retorna um "chat model" mínimo compatível com o padrão `.invoke([HumanMessage])` do LangChain.
 * Ver providers/*.provider.ts para o comportamento específico de cada motor.
 */
export const getAiModel = (
  modelName: string = 'local-llama3',
  temperature: number = 0.7,
  agentContext: string = 'system',
): AiChatModel => {
  const resolvedModel = resolveModelName(modelName);

  return {
    async invoke(messages: BaseMessage[]): Promise<AiInvokeResult> {
      // AI-011: verificado antes de qualquer tentativa de rede — se o orçamento mensal já foi
      // excedido, a chamada nem chega a ser tentada em nenhum provedor.
      await assertAiBudgetNotExceeded();

      const requestMessages = toChatCompletionMessages(messages);
      const invokeStartedAt = Date.now();
      const { response, providerUsed } = await callWithFallback(
        resolvedModel,
        requestMessages,
        temperature,
        agentContext,
      );

      const usage = response.usage;
      const content = response.choices?.[0]?.message?.content?.trim() ?? '';

      // Métrica de custo (ai_usage_cost_usd_total): registrada aqui, não em logAiUsage(), porque
      // aqui já temos o provedor real que atendeu a chamada (providerUsed) — logAiUsage() só
      // recebe model/usage, sem saber se veio de Groq/OpenAI/LiteLLM. Dispara sempre que a
      // chamada teve sucesso, independentemente de o chamador decidir persistir o AILog.
      recordAiUsageCost(
        providerUsed,
        requestContext.getStore()?.tenantId,
        estimateCostUsd(response.model || resolvedModel, {
          totalTokens: usage?.total_tokens ?? 0,
          promptTokens: usage?.prompt_tokens ?? 0,
          completionTokens: usage?.completion_tokens ?? 0,
        }),
      );

      traceAiGeneration({
        provider: providerUsed,
        model: response.model || resolvedModel,
        agentContext,
        temperature,
        input: requestMessages,
        output: content,
        usage,
        startedAt: invokeStartedAt,
      });

      return {
        content,
        response_metadata: {
          model: response.model || resolvedModel,
          tokenUsage: {
            totalTokens: usage?.total_tokens ?? 0,
            promptTokens: usage?.prompt_tokens ?? 0,
            completionTokens: usage?.completion_tokens ?? 0,
          },
        },
      };
    },
  };
};
