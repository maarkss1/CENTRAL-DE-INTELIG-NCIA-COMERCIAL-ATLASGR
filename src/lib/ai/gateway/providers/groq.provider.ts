/**
 * Adapter Groq — rota principal do gateway hoje (rápido, sem o gargalo de concorrência do modelo
 * local). Ver `../chat-model.ts` para a ordem de fallback completa.
 */
import { callProvider } from '../circuit-breaker.js';
import { requestChatCompletion } from '../http-client.js';
import { resolveGroqModelName } from '../model-routing.js';
import type { ChatCompletionResponse } from '../types.js';
import type { ProviderAdapter, ProviderChatParams } from './types.js';

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';

export const groqProvider: ProviderAdapter = {
    name: 'groq',
    isConfigured(): boolean {
        return Boolean(process.env.GROQ_API_KEY);
    },
    async chatCompletion(params: ProviderChatParams): Promise<ChatCompletionResponse> {
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) throw new Error('Groq não está configurado (GROQ_API_KEY ausente).');
        const groqModel = resolveGroqModelName(params.resolvedModel);
        return callProvider('groq', () => requestChatCompletion(
            GROQ_CHAT_URL,
            apiKey,
            groqModel,
            params.messages,
            params.temperature,
            params.agentContext,
            params.timeoutMs,
            false, // Groq ignora user/metadata — não vazamos agentContext para fora sem necessidade.
        ));
    },
};
