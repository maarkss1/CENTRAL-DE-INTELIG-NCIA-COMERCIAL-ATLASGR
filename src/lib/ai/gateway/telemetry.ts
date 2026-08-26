/**
 * Telemetria de observabilidade (Langfuse) de uma geração de IA. Isolado do custo/métricas
 * Prometheus (../metrics.ts, ../budget.ts) e do log de uso persistido (../usage-log.ts): este
 * módulo só cuida do trace estruturado (input/output/latência/tokens) enviado ao Langfuse, quando
 * configurado.
 */
import { requestContext } from '../../async-context.js';
import { logger } from '../../logger.js';
import { getLangfuseClient } from '../../langfuse.js';
import type { ChatCompletionMessage, ChatCompletionResponse } from './types.js';

/**
 * Envia um trace de observabilidade para o Langfuse (se LANGFUSE_PUBLIC_KEY/SECRET_KEY estiverem
 * configurados — ver src/lib/langfuse.ts). Nunca lança: telemetria não pode derrubar uma resposta
 * de IA que já foi entregue com sucesso ao chamador.
 */
export function traceAiGeneration(params: {
    provider: string;
    model: string;
    agentContext: string;
    temperature: number;
    input: ChatCompletionMessage[];
    output: string;
    usage?: ChatCompletionResponse['usage'];
    startedAt: number;
}): void {
    const langfuse = getLangfuseClient();
    if (!langfuse) return;
    try {
        langfuse.generation({
            name: `ai-gateway:${params.agentContext}`,
            model: params.model,
            modelParameters: { temperature: params.temperature, provider: params.provider },
            input: params.input,
            output: params.output,
            usage: params.usage && {
                promptTokens: params.usage.prompt_tokens,
                completionTokens: params.usage.completion_tokens,
                totalTokens: params.usage.total_tokens,
            },
            startTime: new Date(params.startedAt),
            endTime: new Date(),
            metadata: { organizationId: requestContext.getStore()?.tenantId ?? null },
        });
    } catch (error) {
        logger.warn({ err: error }, 'Falha ao registrar trace no Langfuse');
    }
}
