import { GoogleGenAI } from '@google/genai';
import type { BaseMessage } from '@langchain/core/messages';

// Chamamos a API do Gemini diretamente (via SDK oficial @google/genai) em vez de depender
// de um proxy LiteLLM rodando em Docker — uma dependência a menos entre "configurar a chave"
// e "a IA responder". Se no futuro for necessário rotear para outros provedores (GPT, Claude,
// etc.), o LITELLM_URL continua disponível como alternativa (ver getAiModelViaLiteLLM abaixo).
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Apelidos usados no restante do código (ai.service.ts, leadQualification.ts) mapeados para os
// nomes de modelo reais da API Gemini. Usamos os aliases "-latest" para não quebrar de novo
// quando a Google aposentar uma versão pontual (foi o que aconteceu com gemini-1.5-*).
const MODEL_ALIASES: Record<string, string> = {
    'gemini-pro': 'gemini-pro-latest',
    'gemini-flash': 'gemini-flash-latest',
};



function messagesToPrompt(messages: BaseMessage[]): string {
    return messages
        .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
        .join('\n\n');
}

export interface AiTokenUsage {
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
}

export interface AiInvokeResult {
    content: string;
    response_metadata: { tokenUsage: AiTokenUsage; model: string };
}

export interface AiChatModel {
    invoke(messages: BaseMessage[]): Promise<AiInvokeResult>;
}

/**
 * Retorna um "chat model" mínimo compatível com o padrão `.invoke([HumanMessage])` do LangChain,
 * mas que por baixo dos panos chama a Gemini API diretamente — sem depender do container LiteLLM.
 */
export const getAiModel = (modelName: string = 'gemini-pro', temperature: number = 0.7): AiChatModel => {
    const resolvedModel = MODEL_ALIASES[modelName] || modelName;
    const LITELLM_URL = process.env.LITELLM_URL || 'http://localhost:4000';
    const LITELLM_KEY = process.env.LITELLM_KEY || 'sk-litellm';

    return {
        async invoke(messages: BaseMessage[]): Promise<AiInvokeResult> {
            const prompt = messagesToPrompt(messages);

            let response;
            try {
                const res = await fetch(`${LITELLM_URL}/v1/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${LITELLM_KEY}`
                    },
                    body: JSON.stringify({
                        model: resolvedModel,
                        messages: [{ role: 'user', content: prompt }],
                        temperature
                    })
                });

                if (!res.ok) {
                    const err = await res.text();
                    throw new Error(err);
                }
                
                response = await res.json();
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                throw new Error(`Falha ao chamar o LiteLLM Gateway (modelo ${resolvedModel}): ${message}`);
            }

            const usage = response.usage;
            return {
                content: response.choices?.[0]?.message?.content ?? '',
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

// Preço aproximado por 1M de tokens (USD) — usado só para estimar custo no AILog, não é cobrança real.
const PRICING_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
    'gemini-flash-latest': { input: 0.075, output: 0.3 },
    'gemini-pro-latest': { input: 1.25, output: 5.0 },
};

export function estimateCostUsd(model: string, usage: AiTokenUsage): number {
    const pricing = PRICING_PER_MILLION_TOKENS[model] ?? PRICING_PER_MILLION_TOKENS['gemini-flash-latest'];
    return (usage.promptTokens / 1_000_000) * pricing.input + (usage.completionTokens / 1_000_000) * pricing.output;
}
