/**
 * Contrato uniforme que todo adapter de provedor (groq/openai/litellm) implementa. Padronizar
 * essa forma é o que permite ao orquestrador (`../chat-model.ts`) percorrer a cadeia de fallback
 * sem saber nada específico de cada provedor — trocar de provedor, ou adicionar um novo, nunca
 * exige alterar `chat-model.ts` além de incluí-lo na lista de adapters.
 */
import type { ChatCompletionMessage, ChatCompletionResponse, ProviderName } from '../types.js';

export interface ProviderChatParams {
    messages: ChatCompletionMessage[];
    temperature: number;
    agentContext: string;
    /** Nome de modelo já resolvido pelo model-routing (independente de provedor). Cada adapter
     * decide se usa esse valor direto ou o remapeia para o nome específico do provedor. */
    resolvedModel: string;
    timeoutMs: number;
}

export interface ProviderAdapter {
    readonly name: ProviderName;
    /** Indica se o provedor tem as credenciais/URL necessárias configuradas via env. Falso não é
     * erro — só significa "pular esta camada da cadeia de fallback". */
    isConfigured(): boolean;
    chatCompletion(params: ProviderChatParams): Promise<ChatCompletionResponse>;
}
