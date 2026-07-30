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

const DEFAULT_GATEWAY_TIMEOUT_MS = 30_000;
const DEFAULT_FALLBACK_TIMEOUT_MS = 60_000;
const MAX_MESSAGES_PER_REQUEST = 100;
const MAX_TOTAL_MESSAGE_CHARS = 200_000;
const MAX_EMBEDDING_INPUT_CHARS = 100_000;

type ChatCompletionRole = 'system' | 'user' | 'assistant';

export interface ChatCompletionMessage {
    role: ChatCompletionRole;
    content: string;
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

function readBoundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
    if (!value?.trim()) return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.round(parsed)));
}

function normalizeTemperature(value: number): number {
    if (!Number.isFinite(value)) return 0.7;
    return Math.min(2, Math.max(0, value));
}

function normalizeApiBaseUrl(value: string): string {
    return value.trim().replace(/\/+$/, '').replace(/\/v1$/i, '');
}

function sanitizeProviderMessage(value: unknown): string {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return (text || 'Erro sem detalhes fornecidos pelo provedor')
        .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, 'Bearer [REDACTED]')
        .replace(/\b(?:gsk|sk)[_-][A-Za-z0-9_-]{12,}\b/gi, '[REDACTED]')
        .replace(/(api[_-]?key|token|secret)\s*[:=]\s*["']?[^"',\s}]+/gi, '$1=[REDACTED]')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 500);
}

async function readProviderError(response: Response): Promise<string> {
    const body = await response.text();
    try {
        const parsed = JSON.parse(body) as {
            error?: { message?: unknown } | unknown;
            message?: unknown;
        };
        const nestedError = typeof parsed.error === 'object' && parsed.error !== null && 'message' in parsed.error
            ? parsed.error.message
            : parsed.error;
        return sanitizeProviderMessage(nestedError || parsed.message || body);
    } catch {
        return sanitizeProviderMessage(body);
    }
}

function messageContentToText(content: unknown): string {
    if (typeof content === 'string') return content;
    if (content === null || content === undefined) return '';
    if (!Array.isArray(content)) return JSON.stringify(content) || String(content);

    return content
        .map((part) => {
            if (typeof part === 'string') return part;
            if (typeof part === 'object' && part !== null && 'text' in part && typeof part.text === 'string') {
                return part.text;
            }
            return JSON.stringify(part);
        })
        .join('\n');
}

function readMessageType(message: BaseMessage): string {
    if (typeof message.getType === 'function') return message.getType();
    if (typeof message._getType === 'function') return message._getType();
    return 'human';
}

/**
 * Converte mensagens LangChain sem perder a hierarquia de instruções.
 * Resultados de ferramentas são apresentados como contexto do usuário porque este
 * gateway mínimo não transporta tool_call_id.
 */
export function toChatCompletionMessages(messages: BaseMessage[]): ChatCompletionMessage[] {
    if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('A solicitação de IA precisa conter ao menos uma mensagem.');
    }
    if (messages.length > MAX_MESSAGES_PER_REQUEST) {
        throw new Error(`A solicitação de IA excede o limite de ${MAX_MESSAGES_PER_REQUEST} mensagens.`);
    }

    let totalChars = 0;
    const converted = messages.map((message): ChatCompletionMessage => {
        const content = messageContentToText(message.content).trim();
        totalChars += content.length;
        const type = readMessageType(message);

        if (type === 'system') return { role: 'system', content };
        if (type === 'ai' || type === 'assistant') return { role: 'assistant', content };
        if (type === 'tool' || type === 'function') {
            return { role: 'user', content: `[Resultado de ferramenta]\n${content}` };
        }
        return { role: 'user', content };
    });

    if (totalChars === 0) {
        throw new Error('A solicitação de IA não pode conter apenas mensagens vazias.');
    }
    if (totalChars > MAX_TOTAL_MESSAGE_CHARS) {
        throw new Error(`A solicitação de IA excede o limite de ${MAX_TOTAL_MESSAGE_CHARS} caracteres.`);
    }

    return converted;
}

async function requestChatCompletion(
    url: string,
    apiKey: string,
    model: string,
    messages: ChatCompletionMessage[],
    temperature: number,
    agentContext: string,
    timeoutMs: number,
    includeMetadata: boolean,
): Promise<ChatCompletionResponse> {
    const body: Record<string, unknown> = {
        model,
        messages,
        temperature: normalizeTemperature(temperature),
    };
    if (includeMetadata) {
        body.user = agentContext.slice(0, 128);
        body.metadata = { agent: agentContext.slice(0, 128) };
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await readProviderError(response)}`);
    }

    const data = await response.json() as ChatCompletionResponse;
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim().length === 0) {
        throw new Error('O provedor retornou uma resposta vazia.');
    }
    return data;
}

/**
 * Retorna um "chat model" mínimo compatível com o padrão `.invoke([HumanMessage])` do LangChain,
 * usando o LiteLLM como rota principal e a API Groq diretamente como contingência local.
 */
export const getAiModel = (modelName: string = 'gemini-pro', temperature: number = 0.7, agentContext: string = 'system'): AiChatModel => {
    const resolvedModel = MODEL_ALIASES[modelName] || modelName;
    const litellmBaseUrl = normalizeApiBaseUrl(process.env.LITELLM_URL || 'http://localhost:4000');
    const litellmKey = process.env.LITELLM_KEY || 'sk-litellm';
    const gatewayTimeoutMs = readBoundedInteger(
        process.env.AI_GATEWAY_TIMEOUT_MS,
        DEFAULT_GATEWAY_TIMEOUT_MS,
        5_000,
        120_000,
    );
    const fallbackTimeoutMs = readBoundedInteger(
        process.env.AI_FALLBACK_TIMEOUT_MS,
        DEFAULT_FALLBACK_TIMEOUT_MS,
        5_000,
        120_000,
    );

    return {
        async invoke(messages: BaseMessage[]): Promise<AiInvokeResult> {
            const requestMessages = toChatCompletionMessages(messages);
            let response: ChatCompletionResponse | undefined;
            let litellmError: unknown;

            try {
                response = await requestChatCompletion(
                    `${litellmBaseUrl}/v1/chat/completions`,
                    litellmKey,
                    resolvedModel,
                    requestMessages,
                    temperature,
                    agentContext,
                    gatewayTimeoutMs,
                    true,
                );
            } catch (error) {
                litellmError = error;
            }

            // O fallback direto mantém o desenvolvimento funcional quando o Docker/LiteLLM
            // estiver desligado. Em produção, o proxy continua sendo a primeira opção.
            let groqError: unknown;
            if (!response && process.env.GROQ_API_KEY) {
                const groqModel = GROQ_MODEL_ALIASES[resolvedModel] || resolvedModel;
                try {
                    response = await requestChatCompletion(
                        'https://api.groq.com/openai/v1/chat/completions',
                        process.env.GROQ_API_KEY,
                        groqModel,
                        requestMessages,
                        temperature,
                        agentContext,
                        fallbackTimeoutMs,
                        false,
                    );
                } catch (error) {
                    groqError = error;
                }
            }

            let openaiError: unknown;
            if (!response && process.env.OPENAI_API_KEY) {
                try {
                    response = await requestChatCompletion(
                        'https://api.openai.com/v1/chat/completions',
                        process.env.OPENAI_API_KEY,
                        'gpt-4o-mini', // Fallback universal para operações de alta disponibilidade
                        requestMessages,
                        temperature,
                        agentContext,
                        fallbackTimeoutMs,
                        false,
                    );
                } catch (error) {
                    openaiError = error;
                }
            }

            if (!response) {
                const proxyMessage = sanitizeProviderMessage(
                    litellmError instanceof Error ? litellmError.message : litellmError,
                );
                const groqMessage = sanitizeProviderMessage(
                    groqError instanceof Error ? groqError.message : groqError,
                );
                const openaiMessage = sanitizeProviderMessage(
                    openaiError instanceof Error ? openaiError.message : openaiError,
                );
                throw new Error(`Os motores de IA estão indisponíveis. LiteLLM: ${proxyMessage}. Groq: ${groqMessage}. OpenAI: ${openaiMessage}`);
            }

            const usage = response.usage;
            return {
                content: response.choices?.[0]?.message?.content?.trim() ?? '',
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
    const normalizedText = text.trim();
    if (!normalizedText) throw new Error('O texto do embedding não pode ser vazio.');
    if (normalizedText.length > MAX_EMBEDDING_INPUT_CHARS) {
        throw new Error(`O texto do embedding excede ${MAX_EMBEDDING_INPUT_CHARS} caracteres.`);
    }

    const response = await fetch(`${LITELLM_URL}/v1/embeddings`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${LITELLM_KEY}`
        },
        body: JSON.stringify({
            model: 'gemini/text-embedding-004',
            input: normalizedText
        }),
        signal: AbortSignal.timeout(readBoundedInteger(
            process.env.AI_EMBEDDING_TIMEOUT_MS,
            DEFAULT_GATEWAY_TIMEOUT_MS,
            5_000,
            120_000,
        )),
    });

    if (!response.ok) {
        throw new Error(`Falha ao gerar embedding (HTTP ${response.status}): ${await readProviderError(response)}`);
    }

    const data = await response.json() as { data?: Array<{ embedding?: unknown }> };
    const embedding = data.data?.[0]?.embedding;
    if (!Array.isArray(embedding) || embedding.length === 0 || !embedding.every(Number.isFinite)) {
        throw new Error('O provedor retornou um embedding inválido.');
    }
    return embedding as number[];
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
