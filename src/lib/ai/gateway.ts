import type { BaseMessage } from '@langchain/core/messages';
import { prisma } from '../prisma.js';
import { logger } from '../logger.js';

// Nome lógico mantido por compatibilidade com os serviços existentes.
export const GEMINI_MODEL = 'gemini-pro';

// O app usa nomes lógicos para não acoplar cada ferramenta a um provedor específico.
// O LiteLLM resolve esses nomes conforme litellm-config.yaml.
const MODEL_ALIASES: Record<string, string> = {
    'gemini-2.5-pro': 'gemini-pro',
    'gemini-pro-latest': 'gemini-pro',
    'gemini-flash-latest': 'gemini-flash',
};

const GROQ_MODEL_ALIASES: Record<string, string> = {
    'gemini-pro': 'llama-3.3-70b-versatile',
    'gemini-flash': 'llama-3.1-8b-instant',
    'gpt-4o': 'llama-3.3-70b-versatile',
    'gpt-4o-mini': 'llama-3.1-8b-instant',
    'claude-sonnet': 'llama-3.3-70b-versatile',
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

interface ChatCompletionResponse {
    model?: string;
    choices?: Array<{ message?: { content?: string } }>;
    usage?: {
        total_tokens?: number;
        prompt_tokens?: number;
        completion_tokens?: number;
    };
}

function normalizeApiBaseUrl(value: string): string {
    return value.trim().replace(/\/+$/, '').replace(/\/v1$/i, '');
}

async function readProviderError(response: Response): Promise<string> {
    const body = await response.text();
    try {
        const parsed = JSON.parse(body);
        return parsed?.error?.message || parsed?.error || parsed?.message || body;
    } catch {
        return body;
    }
}

async function requestChatCompletion(
    url: string,
    apiKey: string,
    model: string,
    prompt: string,
    temperature: number,
    agentContext: string,
    timeoutMs: number,
): Promise<ChatCompletionResponse> {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature,
            user: agentContext,
            metadata: { agent: agentContext },
        }),
        signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
        throw new Error(await readProviderError(response));
    }

    return response.json() as Promise<ChatCompletionResponse>;
}

/**
 * Retorna um "chat model" mínimo compatível com o padrão `.invoke([HumanMessage])` do LangChain,
 * usando o LiteLLM como rota principal e a API Groq diretamente como contingência local.
 */
export const getAiModel = (modelName: string = 'gemini-pro', temperature: number = 0.7, agentContext: string = 'system'): AiChatModel => {
    const resolvedModel = MODEL_ALIASES[modelName] || modelName;
    const litellmBaseUrl = normalizeApiBaseUrl(process.env.LITELLM_URL || 'http://localhost:4000');
    const litellmKey = process.env.LITELLM_KEY || 'sk-litellm';

    return {
        async invoke(messages: BaseMessage[]): Promise<AiInvokeResult> {
            const prompt = messagesToPrompt(messages);
            let response: ChatCompletionResponse | undefined;
            let litellmError: unknown;

            try {
                response = await requestChatCompletion(
                    `${litellmBaseUrl}/v1/chat/completions`,
                    litellmKey,
                    resolvedModel,
                    prompt,
                    temperature,
                    agentContext,
                    5_000,
                );
            } catch (error) {
                litellmError = error;
            }

            // O fallback direto mantém o desenvolvimento funcional quando o Docker/LiteLLM
            // estiver desligado. Em produção, o proxy continua sendo a primeira opção.
            if (!response && process.env.GROQ_API_KEY) {
                const groqModel = GROQ_MODEL_ALIASES[resolvedModel] || resolvedModel;
                try {
                    response = await requestChatCompletion(
                        'https://api.groq.com/openai/v1/chat/completions',
                        process.env.GROQ_API_KEY,
                        groqModel,
                        prompt,
                        temperature,
                        agentContext,
                        60_000,
                    );
                } catch (groqError) {
                    const proxyMessage = litellmError instanceof Error ? litellmError.message : String(litellmError);
                    const groqMessage = groqError instanceof Error ? groqError.message : String(groqError);
                    throw new Error(`Os motores de IA estão indisponíveis. LiteLLM: ${proxyMessage}. Groq: ${groqMessage}`);
                }
            }

            if (!response) {
                const message = litellmError instanceof Error ? litellmError.message : String(litellmError);
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
    'llama-3.1-8b-instant': { input: 0.05, output: 0.08 },
    'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },
    'gemini-pro': { input: 0.59, output: 0.79 },
    'gemini-flash': { input: 0.05, output: 0.08 },
    'gemini-flash-latest': { input: 0.075, output: 0.3 },
    'gemini-pro-latest': { input: 1.25, output: 5.0 },
};

export function estimateCostUsd(model: string, usage: AiTokenUsage): number {
    const pricing = PRICING_PER_MILLION_TOKENS[model] ?? PRICING_PER_MILLION_TOKENS['gemini-flash'];
    return (usage.promptTokens / 1_000_000) * pricing.input + (usage.completionTokens / 1_000_000) * pricing.output;
}

/**
 * Gera um embedding (array de floats) para o texto fornecido.
 * Usado para a Memória Vetorial (RAG) do Agente SDR via pgvector.
 */
export const generateEmbedding = async (text: string): Promise<number[]> => {
    // Usamos a API do Gemini via fetch. O URL litellm suporta `/v1/embeddings` se configurado,
    // Mas para simplificar vamos direto no provider se o LITELLM_URL não for um proxy de embedding
    const LITELLM_URL = normalizeApiBaseUrl(process.env.LITELLM_URL || 'http://localhost:4000');
    const LITELLM_KEY = process.env.LITELLM_KEY || 'sk-litellm';
    
    const response = await fetch(`${LITELLM_URL}/v1/embeddings`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${LITELLM_KEY}`
        },
        body: JSON.stringify({
            model: 'gemini/text-embedding-004',
            input: text
        })
    });
    
    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Failed to generate embedding: ${err}`);
    }
    
    const data = await response.json();
    return data.data[0].embedding;
};
export interface AiUsageLogInput {
    model: string;
    usage: AiTokenUsage;
    latencyMs: number;
    promptId?: string;
}

export const logAiUsage = async (input: AiUsageLogInput): Promise<void> => {
    try {
        await prisma.aILog.create({
            data: {
                model: input.model,
                tokens: input.usage.totalTokens,
                cost: estimateCostUsd(input.model, input.usage),
                latencyMs: input.latencyMs,
                promptId: input.promptId,
            },
        });
    } catch (error) {
        // Telemetria nunca deve derrubar a resposta útil ao usuário.
        logger.warn({ err: error, model: input.model }, 'Unable to persist AI usage log');
    }
};
