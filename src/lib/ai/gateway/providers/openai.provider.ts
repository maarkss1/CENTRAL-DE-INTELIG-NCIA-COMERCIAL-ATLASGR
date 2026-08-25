/**
 * Adapter OpenAI — segunda opção na cadeia de fallback, só entra em jogo se Groq falhar (ou não
 * estiver configurado). Ver `../chat-model.ts` para a ordem completa.
 */
import { callProvider } from '../circuit-breaker.js';
import { requestChatCompletion } from '../http-client.js';
import type { ChatCompletionResponse } from '../types.js';
import type { ProviderAdapter, ProviderChatParams } from './types.js';

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';

// Fallback universal para operações de alta disponibilidade — não usa o `resolvedModel` do
// chamador porque a lista de nomes lógicos deste gateway (local-llama3, qwen-coder, ...) não tem
// correspondência 1:1 com o catálogo da OpenAI; gpt-4o-mini é o modelo mais barato/rápido que
// cobre o mesmo papel de "motor secundário" em qualquer chamada.
const OPENAI_FALLBACK_MODEL = 'gpt-4o-mini';

export const openaiProvider: ProviderAdapter = {
    name: 'openai',
    isConfigured(): boolean {
        return Boolean(process.env.OPENAI_API_KEY);
    },
    async chatCompletion(params: ProviderChatParams): Promise<ChatCompletionResponse> {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error('OpenAI não está configurado (OPENAI_API_KEY ausente).');
        return callProvider('openai', () => requestChatCompletion(
            OPENAI_CHAT_URL,
            apiKey,
            OPENAI_FALLBACK_MODEL,
            params.messages,
            params.temperature,
            params.agentContext,
            params.timeoutMs,
            false,
        ));
    },
};
