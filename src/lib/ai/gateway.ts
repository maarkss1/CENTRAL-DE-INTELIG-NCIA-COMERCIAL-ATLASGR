import type { BaseMessage } from '@langchain/core/messages';
import { prisma } from '../prisma.js';
import { logger } from '../logger.js';
import { requestContext } from '../async-context.js';
import { cacheConnection } from '../queue/redis.js';
import { getLangfuseClient } from '../langfuse.js';
import { recordAiUsageCost } from './metrics.js';

/**
 * Envia um trace de observabilidade para o Langfuse (se LANGFUSE_PUBLIC_KEY/SECRET_KEY estiverem
 * configurados — ver src/lib/langfuse.ts). Nunca lança: telemetria não pode derrubar uma resposta
 * de IA que já foi entregue com sucesso ao chamador.
 */
function traceAiGeneration(params: {
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
    'local-llama3': 'openai/gpt-oss-120b',
    'local-llama3-fast': 'openai/gpt-oss-20b',
    'gpt-4o': 'openai/gpt-oss-120b',
    'gpt-4o-mini': 'openai/gpt-oss-20b',
    'claude-sonnet': 'openai/gpt-oss-120b',
};

const DEFAULT_GATEWAY_TIMEOUT_MS = 30_000;
const DEFAULT_FALLBACK_TIMEOUT_MS = 60_000;
const MAX_MESSAGES_PER_REQUEST = 100;
const MAX_TOTAL_MESSAGE_CHARS = 200_000;
const MAX_EMBEDDING_INPUT_CHARS = 100_000;

// Retry só compensa para falhas que podem ser passageiras (timeout, sobrecarga do provedor).
// Uma falha de rede/conexão (provedor fora do ar) não some com uma segunda tentativa imediata —
// nesse caso é melhor cair pro próximo provedor da cadeia o quanto antes.
// 3 tentativas (não 2): um enxame chega a fazer ~6-9 chamadas Groq em poucos segundos (roteamento
// do supervisor + cada especialista + síntese final), então é comum bater no limite de TPM do
// tier gratuito (6000/min) no meio de uma missão — o próprio Groq já informa o tempo de espera
// necessário ("Please try again in 440ms"), então vale a pena esperar exatamente isso e tentar de
// novo em vez de derrubar a etapa inteira do enxame.
const MAX_ATTEMPTS_PER_LEG = 3;
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
 * Extrai o tempo de espera sugerido pelo próprio provedor num erro de rate limit, ex.:
 * "Please try again in 440ms" ou "Please try again in 2.5s" (formato do Groq/OpenAI). Sem isso,
 * um backoff fixo pode ser curto demais (a janela de TPM ainda não resetou) ou desperdiçar tempo
 * esperando mais do que o necessário.
 */
function extractSuggestedRetryDelayMs(message: string): number | null {
    const msMatch = message.match(/try again in\s+([\d.]+)\s*ms/i);
    if (msMatch) return Math.ceil(Number(msMatch[1]));
    const secondsMatch = message.match(/try again in\s+([\d.]+)\s*s\b/i);
    if (secondsMatch) return Math.ceil(Number(secondsMatch[1]) * 1000);
    return null;
}

/**
 * Reexecuta `fn` após uma falha claramente transitória e rápida (HTTP 429/5xx, recusa de conexão)
 * antes de desistir. Timeout não é reexecutado (já esperamos o tempo máximo configurado pra chegar
 * lá) e erros de validação/autenticação (4xx) também não — repetir uma chave inválida ou um payload
 * malformado só adiciona latência sem chance de sucesso.
 * Em erros de rate limit (429), respeita o tempo de espera que o próprio provedor sugeriu em vez do
 * backoff fixo, quando disponível — ver `extractSuggestedRetryDelayMs`.
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
            const suggestedMs = error instanceof Error ? extractSuggestedRetryDelayMs(error.message) : null;
            const delay = suggestedMs !== null ? Math.max(suggestedMs + 50, backoffMs) : backoffMs * (attempt + 1);
            await sleep(delay);
        }
    }
    throw lastError;
}

// ARCH-005: estado do circuit breaker em Redis (cacheConnection — conexão fail-fast, sem fila
// offline) em vez de só Map() local. Antes, cada instância só aprendia da própria experiência: com
// N instâncias atrás do load balancer, cada uma precisava acumular CIRCUIT_FAILURE_THRESHOLD falhas
// por conta própria antes de abrir o circuito, então o provedor recebia até N vezes mais tentativas
// inúteis do que o desenhado. Se o Redis em si estiver indisponível, cai pro Map() local em vez de
// desistir de proteger o provedor inteiramente — um circuit breaker que nunca abre durante uma
// indisponibilidade de Redis (justo quando a infra está com problema) não protegeria nada.
const CIRCUIT_KEY_PREFIX = 'ai-gateway:circuit';
const CIRCUIT_FAILURES_TTL_SECONDS = Math.ceil((CIRCUIT_COOLDOWN_MS / 1000) * 4);

interface LocalCircuitState {
    failures: number;
    openUntil: number;
}
const localCircuitFallback = new Map<string, LocalCircuitState>();

/** Só para testes: limpa o estado do circuit breaker (Redis e o fallback local) entre casos. */
export async function __resetCircuitBreakerForTests(): Promise<void> {
    localCircuitFallback.clear();
    try {
        const keys = await cacheConnection.keys(`${CIRCUIT_KEY_PREFIX}:*`);
        if (keys.length > 0) await cacheConnection.del(...keys);
    } catch {
        // Redis indisponível — só o fallback local importava mesmo, e já foi limpo acima.
    }
}

async function isCircuitOpen(provider: string): Promise<boolean> {
    try {
        const open = await cacheConnection.exists(`${CIRCUIT_KEY_PREFIX}:${provider}:open`);
        return open === 1;
    } catch (err) {
        logger.warn({ err, provider }, 'Circuit breaker: Redis indisponível, usando estado local desta instância');
        const state = localCircuitFallback.get(provider);
        return !!state && Date.now() < state.openUntil;
    }
}

async function recordCircuitSuccess(provider: string): Promise<void> {
    localCircuitFallback.delete(provider);
    try {
        await cacheConnection.del(`${CIRCUIT_KEY_PREFIX}:${provider}:failures`, `${CIRCUIT_KEY_PREFIX}:${provider}:open`);
    } catch (err) {
        logger.warn({ err, provider }, 'Circuit breaker: falha ao limpar estado no Redis (fallback local já limpo)');
    }
}

async function recordCircuitFailure(provider: string): Promise<void> {
    try {
        const failures = await cacheConnection.incr(`${CIRCUIT_KEY_PREFIX}:${provider}:failures`);
        await cacheConnection.expire(`${CIRCUIT_KEY_PREFIX}:${provider}:failures`, CIRCUIT_FAILURES_TTL_SECONDS);
        if (failures >= CIRCUIT_FAILURE_THRESHOLD) {
            await cacheConnection.set(`${CIRCUIT_KEY_PREFIX}:${provider}:open`, '1', 'PX', CIRCUIT_COOLDOWN_MS);
        }
    } catch (err) {
        logger.warn({ err, provider }, 'Circuit breaker: Redis indisponível, contando falha só localmente');
        const state = localCircuitFallback.get(provider) ?? { failures: 0, openUntil: 0 };
        state.failures += 1;
        if (state.failures >= CIRCUIT_FAILURE_THRESHOLD) {
            state.openUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
        }
        localCircuitFallback.set(provider, state);
    }
}

/**
 * Combina o circuit breaker com `withRetry`: se o provedor já acumulou falhas consecutivas
 * recentes, nem tenta de novo (evita pagar o timeout inteiro em cada chamada enquanto ele está
 * sabidamente fora do ar) — só volta a tentar depois do resfriamento.
 */
async function callProvider<T>(provider: string, fn: () => Promise<T>): Promise<T> {
    if (await isCircuitOpen(provider)) {
        throw new Error(`Provedor "${provider}" temporariamente desativado após falhas recentes (nova tentativa em breve).`);
    }
    try {
        const result = await withRetry(fn, MAX_ATTEMPTS_PER_LEG - 1, RETRY_BASE_DELAY_MS);
        await recordCircuitSuccess(provider);
        return result;
    } catch (error) {
        await recordCircuitFailure(provider);
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
 * Retorna um "chat model" mínimo compatível com o padrão `.invoke([HumanMessage])` do LangChain.
 *
 * Motor local (Ollama via LiteLLM) removido de propósito: nesta máquina o Ollama processa uma
 * única completion por vez (confirmado por teste direto — três chamadas simultâneas faziam a
 * segunda terminar em ~60s e a terceira nunca terminar), então qualquer missão com mais de um
 * agente ficava lenta ou travava esperando o motor local, mesmo com a fila de serialização. Groq
 * é a rota principal agora (rápido, sem esse gargalo de concorrência); OpenAI continua como
 * segunda opção só se configurado.
 */
export const getAiModel = (modelName: string = 'local-llama3', temperature: number = 0.7, agentContext: string = 'system'): AiChatModel => {
    const resolvedModel = MODEL_ALIASES[modelName] || modelName;
    const fallbackTimeoutMs = readBoundedInteger(
        process.env.AI_FALLBACK_TIMEOUT_MS,
        DEFAULT_FALLBACK_TIMEOUT_MS,
        5_000,
        120_000,
    );

    return {
        async invoke(messages: BaseMessage[]): Promise<AiInvokeResult> {
            const requestMessages = toChatCompletionMessages(messages);
            const invokeStartedAt = Date.now();
            let response: ChatCompletionResponse | undefined;
            let providerUsed = '';

            // Groq primeiro (rápido, sem o gargalo de concorrência do modelo local). LiteLLM entra
            // só como reserva mais abaixo, depois de Groq/OpenAI — tentar o LiteLLM (que
            // nesta máquina resolve pro Ollama local, capaz de processar só 1 requisição por vez)
            // antes do Groq reintroduziria exatamente a lentidão que motivou tirá-lo da rota
            // principal do enxame de agentes.
            let groqError: unknown;
            if (process.env.GROQ_API_KEY) {
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
                    providerUsed = 'groq';
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
                    providerUsed = 'openai';
                } catch (error) {
                    openaiError = error;
                }
            }

            // Provedor Local/Self-hosted (Ollama direto ou LiteLLM na nuvem/VPS)
            let litellmError: unknown;
            const localAiUrl = process.env.OLLAMA_BASE_URL || process.env.LITELLM_URL;
            if (!response && localAiUrl) {
                const baseUrl = normalizeApiBaseUrl(localAiUrl);
                const litellmKey = process.env.LITELLM_KEY || process.env.OLLAMA_API_KEY || 'ollama';
                try {
                    response = await callProvider('litellm', () => requestChatCompletion(
                        `${baseUrl}/v1/chat/completions`,
                        litellmKey,
                        resolvedModel,
                        requestMessages,
                        temperature,
                        agentContext,
                        fallbackTimeoutMs,
                        true,
                    ));
                    providerUsed = 'litellm';
                } catch (error) {
                    litellmError = error;
                }
            }

            if (!response) {
                const litellmMessage = sanitizeProviderMessage(
                    litellmError instanceof Error ? litellmError.message : litellmError,
                );
                const groqMessage = sanitizeProviderMessage(
                    groqError instanceof Error ? groqError.message : groqError,
                );
                const openaiMessage = sanitizeProviderMessage(
                    openaiError instanceof Error ? openaiError.message : openaiError,
                );
                const configured = [
                    process.env.GROQ_API_KEY && 'Groq',
                    process.env.OPENAI_API_KEY && 'OpenAI',
                    localAiUrl && 'Ollama/LiteLLM',
                ].filter(Boolean).join(', ');

                throw new Error(
                    configured
                        ? `Os motores de IA estão indisponíveis (${configured}). Groq: ${groqMessage}. OpenAI: ${openaiMessage}. LiteLLM: ${litellmMessage}`
                        : 'Nenhum motor de IA configurado. Defina GROQ_API_KEY (gratuito, console.groq.com) ou OPENAI_API_KEY no .env.',
                );
            }

            const usage = response.usage;
            const content = response.choices?.[0]?.message?.content?.trim() ?? '';

            // Métrica de custo (ai_usage_cost_usd_total): registrada aqui, não em logAiUsage(), porque
            // aqui já temos o provedor real que atendeu a chamada (providerUsed) — logAiUsage() só
            // recebe model/usage, sem saber se veio de Groq/OpenAI/Gemini/LiteLLM. Dispara sempre que
            // a chamada teve sucesso, independentemente de o chamador decidir persistir o AILog.
            recordAiUsageCost(
                providerUsed,
                requestContext.getStore()?.tenantId,
                estimateCostUsd(response.model || resolvedModel, {
                    totalTokens: usage?.total_tokens ?? 0,
                    promptTokens: usage?.prompt_tokens ?? 0,
                    completionTokens: usage?.completion_tokens ?? 0,
                }),
            );

            traceAiGeneration({
                provider: providerUsed,
                model: response.model || resolvedModel,
                agentContext,
                temperature,
                input: requestMessages,
                output: content,
                usage,
                startedAt: invokeStartedAt,
            });

            return {
                content,
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

/**
 * Extrai e converte respostas JSON retornadas por modelos de IA,
 * removendo blocos de código Markdown (```json ... ```) e caracteres excedentes.
 */
export function cleanAndParseJson<T>(content: string): T {
    if (!content || typeof content !== 'string') {
        throw new Error('Conteúdo para parse JSON está vazio ou é inválido.');
    }

    let cleaned = content.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    const firstBrace = cleaned.search(/[{[]/);
    const lastBrace = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }

    try {
        return JSON.parse(cleaned) as T;
    } catch (err) {
        throw new Error(`Falha ao decodificar JSON gerado pela IA: ${(err as Error).message}. Conteúdo original: ${content.slice(0, 200)}...`);
    }
}

// Preço aproximado por 1M de tokens (USD) — usado só para estimar custo no AILog, não é cobrança real.
const PRICING_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
    'openai/gpt-oss-20b': { input: 0.075, output: 0.30 },
    'openai/gpt-oss-120b': { input: 0.15, output: 0.60 },
    'local-llama3': { input: 0.15, output: 0.60 },
    'local-llama3-fast': { input: 0.075, output: 0.30 },
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

    // EMBEDDINGS_PROVIDER=gateway é o caminho legado via proxy LiteLLM (pré-modelo local). O
    // modelo servido pelo proxy é definido em litellm-config.yaml, fora deste código.
    const LITELLM_URL = normalizeApiBaseUrl(process.env.LITELLM_URL || 'http://localhost:4000');
    const LITELLM_KEY = process.env.LITELLM_KEY || 'sk-litellm';
    const normalizedText = text.trim();
    if (!normalizedText) throw new Error('O texto do embedding não pode ser vazio.');
    if (normalizedText.length > MAX_EMBEDDING_INPUT_CHARS) {
        throw new Error(`O texto do embedding excede ${MAX_EMBEDDING_INPUT_CHARS} caracteres.`);
    }

    return callProvider('embedding', async () => {
        const response = await fetch(`${LITELLM_URL}/v1/embeddings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${LITELLM_KEY}`
            },
            body: JSON.stringify({
                model: process.env.LITELLM_EMBEDDING_MODEL || 'text-embedding-3-small',
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
