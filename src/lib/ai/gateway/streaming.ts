/**
 * Streaming real de tokens — só Groq (rota principal hoje), sem retry/fallback entre provedores
 * no meio do stream: uma vez que o primeiro chunk já foi entregue ao chamador, trocar de provedor
 * significaria reiniciar a resposta do zero de forma visível para quem já está lendo o texto
 * parcial. Se Groq não estiver configurado, com o circuito aberto, ou falhar antes do primeiro
 * chunk, lança — o chamador deve cair para `getAiModel(...).invoke()` (sem streaming) nesse caso,
 * igual ao comportamento de hoje.
 *
 * Usado só onde a saída é texto livre (Chatbook, Relatórios IA) — nunca para JSON estruturado
 * (`invokeStructured`), que depende de ler a resposta inteira para validar/reparar o formato.
 */
import type { BaseMessage } from '@langchain/core/messages';
import { requestContext } from '../../async-context.js';
import { assertAiBudgetNotExceeded } from '../budget.js';
import { recordAiUsageCost } from '../metrics.js';
import { isCircuitOpen, recordCircuitFailure, recordCircuitSuccess } from './circuit-breaker.js';
import { resolveFallbackTimeoutMs, normalizeTemperature } from './http-client.js';
import { resolveGroqModelName, resolveModelName } from './model-routing.js';
import { estimateCostUsd } from './pricing.js';
import { toChatCompletionMessages } from './parsing.js';
import { readProviderError } from './redaction.js';
import { traceAiGeneration } from './telemetry.js';
import type { AiStreamChunk, AiStreamResult, ChatCompletionResponse } from './types.js';

export async function* streamChatCompletion(
    messages: BaseMessage[],
    modelName: string,
    temperature: number,
    agentContext: string,
): AsyncGenerator<AiStreamChunk, AiStreamResult> {
    await assertAiBudgetNotExceeded();

    if (!process.env.GROQ_API_KEY) {
        throw new Error('Streaming de IA requer GROQ_API_KEY configurada.');
    }
    if (await isCircuitOpen('groq')) {
        throw new Error('Provedor "groq" temporariamente desativado após falhas recentes (nova tentativa em breve).');
    }

    const resolvedModel = resolveModelName(modelName);
    const groqModel = resolveGroqModelName(resolvedModel);
    const requestMessages = toChatCompletionMessages(messages);
    const timeoutMs = resolveFallbackTimeoutMs();
    const startedAt = Date.now();

    let response: Response;
    try {
        response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
            },
            body: JSON.stringify({
                model: groqModel,
                messages: requestMessages,
                temperature: normalizeTemperature(temperature),
                stream: true,
                stream_options: { include_usage: true },
            }),
            signal: AbortSignal.timeout(timeoutMs),
        });
    } catch (error) {
        await recordCircuitFailure('groq');
        throw error;
    }

    if (!response.ok || !response.body) {
        await recordCircuitFailure('groq');
        throw new Error(`HTTP ${response.status}: ${await readProviderError(response)}`);
    }

    interface StreamChunkPayload {
        model?: string;
        choices?: Array<{ delta?: { content?: string } }>;
        usage?: ChatCompletionResponse['usage'];
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let lineBuffer = '';
    let fullContent = '';
    let usage: ChatCompletionResponse['usage'];
    let modelUsed = groqModel;

    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            lineBuffer += decoder.decode(value, { stream: true });
            const lines = lineBuffer.split('\n');
            lineBuffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data:')) continue;
                const dataStr = trimmed.slice(5).trim();
                if (!dataStr || dataStr === '[DONE]') continue;

                let parsed: StreamChunkPayload;
                try {
                    parsed = JSON.parse(dataStr) as StreamChunkPayload;
                } catch {
                    continue;
                }
                if (parsed.model) modelUsed = parsed.model;
                if (parsed.usage) usage = parsed.usage;
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) {
                    fullContent += delta;
                    yield { delta };
                }
            }
        }
    } catch (error) {
        await recordCircuitFailure('groq');
        throw error;
    }

    await recordCircuitSuccess('groq');

    recordAiUsageCost(
        'groq',
        requestContext.getStore()?.tenantId,
        estimateCostUsd(modelUsed, {
            totalTokens: usage?.total_tokens ?? 0,
            promptTokens: usage?.prompt_tokens ?? 0,
            completionTokens: usage?.completion_tokens ?? 0,
        }),
    );

    traceAiGeneration({
        provider: 'groq',
        model: modelUsed,
        agentContext,
        temperature,
        input: requestMessages,
        output: fullContent,
        usage,
        startedAt,
    });

    return {
        model: modelUsed,
        usage: {
            totalTokens: usage?.total_tokens ?? 0,
            promptTokens: usage?.prompt_tokens ?? 0,
            completionTokens: usage?.completion_tokens ?? 0,
        },
    };
}
