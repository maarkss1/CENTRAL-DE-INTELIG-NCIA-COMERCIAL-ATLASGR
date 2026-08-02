import type { BaseMessage } from '@langchain/core/messages';
import { prisma } from '../prisma.js';
import { logger } from '../logger.js';
import { requestContext } from '../async-context.js';

// Nome lógico mantido por compatibilidade com os serviços existentes. Renomeado de "gemini-pro"
// (IA-001): esse nome sugeria o Gemini real do Google, mas o alias sempre resolveu, por padrão,
// para um modelo Ollama local via litellm-config.yaml — nunca para o Gemini de verdade.
export const LOCAL_MODEL = 'local-llama3';

// O app usa nomes lógicos para não acoplar cada ferramenta a um provedor específico.
// O LiteLLM resolve esses nomes conforme litellm-config.yaml.
const MODEL_ALIASES: Record<string, string> = {
    'qwen-2.5-coder': 'qwen-coder',
    'deepseek-coder-v2': 'deepseek-coder',
};

const GROQ_MODEL_ALIASES: Record<string, string> = {
    'local-llama3': 'llama-3.3-70b-versatile',
    'local-llama3-fast': 'llama-3.1-8b-instant',
    'gpt-4o': 'llama-3.3-70b-versatile',
    'gpt-4o-mini': 'llama-3.1-8b-instant',
    'claude-sonnet': 'llama-3.3-70b-versatile',
};

const DEFAULT_GATEWAY_TIMEOUT_MS = 30_000;
const DEFAULT_FALLBACK_TIMEOUT_MS = 60_000;
const MAX_MESSAGES_PER_REQUEST = 100;
const MAX_TOTAL_MESSAGE_CHARS = 200_000;
const MAX_EMBEDDING_INPUT_CHARS = 100_000;

// Retry só compensa para falhas que podem ser passageiras (timeout, sobrecarga do provedor).
// Uma falha de rede/conexão (provedor fora do ar) não some com uma segunda tentativa imediata —
// nesse caso é melhor cair pro próximo provedor da cadeia o quanto antes.
const MAX_ATTEMPTS_PER_LEG = 2;
const RETRY_BASE_DELAY_MS = 300;

// Circuit breaker leve em memória: depois de falhas consecutivas, um provedor fica "aberto"
// (pulado sem nova tentativa de rede) por um período de resfriamento, evitando pagar o timeout
// inteiro em cada chamada enquanto ele está sabidamente indisponível.
const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_COOLDOWN_MS = 30_000;

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

function isRetryableAiError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    // Timeout/abort NÃO é reexecutado aqui: por definição já esperamos o tempo máximo configurado
    // (até 120s) para chegar a esse erro, então repetir dobraria a espera do usuário/agente sem
    // ganho real — o gateway já cai para a próxima camada de provedor nesse caso. Só vale a pena
    // reexecutar erros que falham RÁPIDO (resposta HTTP com status de erro, ou recusa de conexão).
    if (/HTTP (429|5\d{2}):/.test(error.message)) return true;
    if (error.name === 'TypeError' && /fetch|network/i.test(error.message)) return true;
    return false;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reexecuta `fn` uma vez após uma falha claramente transitória e rápida (HTTP 429/5xx, recusa de
 * conexão) antes de desistir. Timeout não é reexecutado (já esperamos o tempo máximo configurado
 * pra chegar lá) e erros de validação/autenticação (4xx) também não — repetir uma chave inválida
 * ou um payload malformado só adiciona latência sem chance de sucesso.
 * Usado pelo próprio gateway (cada camada de provedor) e reaproveitado por outros serviços de IA
 * (ex.: geração de conteúdo em ai.service.ts) para não precisarem reimplementar a mesma lógica.
 */
export async function withRetry<T>(fn: () => Promise<T>, retries: number = 1, backoffMs: number = 400): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (attempt === retries || !isRetryableAiError(error)) throw error;
            await sleep(backoffMs * (attempt + 1));
        }
    }
    throw lastError;
}

interface CircuitState {
    failures: number;
    openUntil: number;
}

const circuitState = new Map<string, CircuitState>();

/** Só para testes: limpa o estado do circuit breaker entre casos para evitar interferência. */
export function __resetCircuitBreakerForTests(): void {
    circuitState.clear();
}

function isCircuitOpen(provider: string): boolean {
    const state = circuitState.get(provider);
    return !!state && Date.now() < state.openUntil;
}

function recordCircuitSuccess(provider: string): void {
    circuitState.delete(provider);
}

function recordCircuitFailure(provider: string): void {
    const state = circuitState.get(provider) ?? { failures: 0, openUntil: 0 };
    state.failures += 1;
    if (state.failures >= CIRCUIT_FAILURE_THRESHOLD) {
        state.openUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
    }
    circuitState.set(provider, state);
}

/**
 * Combina o circuit breaker com `withRetry`: se o provedor já acumulou falhas consecutivas
 * recentes, nem tenta de novo (evita pagar o timeout inteiro em cada chamada enquanto ele está
 * sabidamente fora do ar) — só volta a tentar depois do resfriamento.
 */
async function callProvider<T>(provider: string, fn: () => Promise<T>): Promise<T> {
    if (isCircuitOpen(provider)) {
        throw new Error(`Provedor "${provider}" temporariamente desativado após falhas recentes (nova tentativa em breve).`);
    }
    try {
        const result = await withRetry(fn, MAX_ATTEMPTS_PER_LEG - 1, RETRY_BASE_DELAY_MS);
        recordCircuitSuccess(provider);
        return result;
    } catch (error) {
        recordCircuitFailure(provider);
        throw error;
    }
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
export const getAiModel = (modelName: string = 'local-llama3', temperature: number = 0.7, agentContext: string = 'system'): AiChatModel => {
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
                response = await callProvider('litellm', () => requestChatCompletion(
                    `${litellmBaseUrl}/v1/chat/completions`,
                    litellmKey,
                    resolvedModel,
                    requestMessages,
                    temperature,
                    agentContext,
                    gatewayTimeoutMs,
                    true,
                ));
            } catch (error) {
                litellmError = error;
            }

            // O fallback direto mantém o desenvolvimento funcional quando o Docker/LiteLLM
            // estiver desligado. Em produção, o proxy continua sendo a primeira opção.
            let groqError: unknown;
            if (!response && process.env.GROQ_API_KEY) {
                const groqModel = GROQ_MODEL_ALIASES[resolvedModel] || resolvedModel;
                try {
                    response = await callProvider('groq', () => requestChatCompletion(
                        'https://api.groq.com/openai/v1/chat/completions',
                        process.env.GROQ_API_KEY!,
                        groqModel,
                        requestMessages,
                        temperature,
                        agentContext,
                        fallbackTimeoutMs,
                        false,
                    ));
                } catch (error) {
                    groqError = error;
                }
            }

            let openaiError: unknown;
            if (!response && process.env.OPENAI_API_KEY) {
                try {
                    response = await callProvider('openai', () => requestChatCompletion(
                        'https://api.openai.com/v1/chat/completions',
                        process.env.OPENAI_API_KEY!,
                        'gpt-4o-mini', // Fallback universal para operações de alta disponibilidade
                        requestMessages,
                        temperature,
                        agentContext,
                        fallbackTimeoutMs,
                        false,
                    ));
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
    'local-llama3': { input: 0.59, output: 0.79 },
    'local-llama3-fast': { input: 0.05, output: 0.08 },
    'qwen-coder': { input: 0.20, output: 0.60 },
    'deepseek-coder': { input: 0.14, output: 0.28 },
};

export function estimateCostUsd(model: string, usage: AiTokenUsage): number {
    const pricing = PRICING_PER_MILLION_TOKENS[model] ?? PRICING_PER_MILLION_TOKENS['local-llama3-fast'];
    return (usage.promptTokens / 1_000_000) * pricing.input + (usage.completionTokens / 1_000_000) * pricing.output;
}

/**
 * Gera um embedding (array de floats) para o texto fornecido.
 * Usado para a Memória Vetorial (RAG) do Agente SDR via pgvector.
 */
export const generateEmbedding = async (
    text: string,
    kind: 'query' | 'passage' = 'passage',
): Promise<number[]> => {
    // Provedor padrão é o modelo local: não depende de chave, de cota nem de serviço externo no ar.
    // `EMBEDDINGS_PROVIDER=gateway` volta ao caminho antigo (LiteLLM → Google) quando desejado.
    if ((process.env.EMBEDDINGS_PROVIDER || 'local') === 'local') {
        const { embedLocal } = await import('./local-embeddings.js');
        return embedLocal(text, kind);
    }

    // Usamos a API do Gemini via fetch. O URL litellm suporta `/v1/embeddings` se configurado,
    // Mas para simplificar vamos direto no provider se o LITELLM_URL não for um proxy de embedding
    const LITELLM_URL = normalizeApiBaseUrl(process.env.LITELLM_URL || 'http://localhost:4000');
    const LITELLM_KEY = process.env.LITELLM_KEY || 'sk-litellm';
    const normalizedText = text.trim();
    if (!normalizedText) throw new Error('O texto do embedding não pode ser vazio.');
    if (normalizedText.length > MAX_EMBEDDING_INPUT_CHARS) {
        throw new Error(`O texto do embedding excede ${MAX_EMBEDDING_INPUT_CHARS} caracteres.`);
    }

    // Retry + circuit breaker, como no chat. Se o LiteLLM estiver fora, caímos direto no Google
    // (ver `embedFallbackDireto`): em desenvolvimento é comum o proxy não estar de pé, e sem esse
    // caminho a Base de Conhecimento inteira fica sem busca semântica por causa de um proxy.
    try {
        return await callProvider('embedding', async () => {
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
        });
    } catch (erroProxy) {
        const direto = await embedFallbackDireto(normalizedText);
        if (direto) return direto;
        throw erroProxy;
    }
};

/**
 * Caminho alternativo de embeddings: chama a API do Google diretamente, sem passar pelo LiteLLM.
 *
 * Existe porque o proxy é a única rota configurada e, sem ele de pé, todo o RAG para. Devolve
 * `null` (em vez de lançar) quando não há chave ou a chamada falha, para o chamador poder relançar
 * o erro original do proxy — que é o mais informativo sobre a causa raiz.
 */
async function embedFallbackDireto(texto: string): Promise<number[] | null> {
    if (!process.env.GEMINI_API_KEY) return null;
    try {
        const { generateEmbedding: embedDireto } = await import('./embeddings.js');
        const vetor = await embedDireto(texto);
        if (Array.isArray(vetor) && vetor.length > 0 && vetor.every(Number.isFinite)) {
            logger.warn('LiteLLM indisponível para embeddings; usando a API do Google diretamente.');
            return vetor;
        }
        return null;
    } catch (err) {
        logger.error({ err }, 'Fallback direto de embeddings também falhou');
        return null;
    }
}
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
                // Tirado do contexto da requisição em vez de exigir que cada chamador repasse o
                // tenant. Fica nulo em execuções fora de requisição (scripts, workers), e a tela
                // de Consumo trata esses registros como não atribuídos em vez de somá-los a alguém.
                organizationId: requestContext.getStore()?.tenantId ?? null,
            },
        });
    } catch (error) {
        // Telemetria nunca deve derrubar a resposta útil ao usuário.
        logger.warn({ err: error, model: input.model }, 'Unable to persist AI usage log');
    }
};
