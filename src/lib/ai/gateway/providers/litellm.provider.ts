/**
 * Adapter LiteLLM/Ollama (local ou self-hosted) — último recurso na cadeia de fallback, não a
 * primeira tentativa: nesta infraestrutura o Ollama processa uma única completion por vez
 * (confirmado por teste direto — três chamadas simultâneas faziam a segunda terminar em ~60s e a
 * terceira nunca terminar), então só vale a pena pagar esse gargalo depois de Groq/OpenAI já
 * terem falhado, nunca antes. Ver `../chat-model.ts` para a ordem completa.
 */
import { callProvider } from '../circuit-breaker.js';
import { normalizeApiBaseUrl, requestChatCompletion } from '../http-client.js';
import type { ChatCompletionResponse } from '../types.js';
import type { ProviderAdapter, ProviderChatParams } from './types.js';

function resolveBaseUrl(): string | undefined {
    const url = process.env.OLLAMA_BASE_URL || process.env.LITELLM_URL;
    return url ? normalizeApiBaseUrl(url) : undefined;
}

function resolveApiKey(): string {
    return process.env.LITELLM_KEY || process.env.OLLAMA_API_KEY || 'ollama';
}

export const litellmProvider: ProviderAdapter = {
    name: 'litellm',
    isConfigured(): boolean {
        return Boolean(resolveBaseUrl());
    },
    async chatCompletion(params: ProviderChatParams): Promise<ChatCompletionResponse> {
        const baseUrl = resolveBaseUrl();
        if (!baseUrl) throw new Error('LiteLLM/Ollama não está configurado (OLLAMA_BASE_URL/LITELLM_URL ausente).');
        return callProvider('litellm', () => requestChatCompletion(
            `${baseUrl}/v1/chat/completions`,
            resolveApiKey(),
            params.resolvedModel,
            params.messages,
            params.temperature,
            params.agentContext,
            params.timeoutMs,
            true, // LiteLLM usa user/metadata para atribuir a chamada ao agente que a originou.
        ));
    },
};

export { resolveBaseUrl as resolveLitellmBaseUrl, resolveApiKey as resolveLitellmApiKey };
