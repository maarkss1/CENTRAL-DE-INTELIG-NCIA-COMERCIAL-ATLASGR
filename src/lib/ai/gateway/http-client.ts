/**
 * Transporte HTTP genérico e compatível com Chat Completions (formato OpenAI), compartilhado
 * pelos três adapters de provedor (providers/groq.provider.ts, openai.provider.ts,
 * litellm.provider.ts). Nenhum deles fala com `fetch` diretamente — todos passam por aqui, o que
 * garante timeout, normalização de payload e leitura de erro padronizados entre provedores
 * (critério de aceite: "erros e respostas padronizados entre providers").
 */
import { readProviderError } from './redaction.js';
import type { ChatCompletionMessage, ChatCompletionResponse } from './types.js';

const DEFAULT_GATEWAY_TIMEOUT_MS = 30_000;
const DEFAULT_FALLBACK_TIMEOUT_MS = 60_000;

export function readBoundedInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

export function normalizeTemperature(value: number): number {
  if (!Number.isFinite(value)) return 0.7;
  return Math.min(2, Math.max(0, value));
}

export function normalizeApiBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '').replace(/\/v1$/i, '');
}

/** Timeout usado no fallback entre provedores (Groq → OpenAI → LiteLLM), configurável via
 * `AI_FALLBACK_TIMEOUT_MS`. Único ponto que lê essa env var — todo adapter recebe o valor já
 * resolvido, nunca lê `process.env` diretamente. */
export function resolveFallbackTimeoutMs(): number {
  return readBoundedInteger(
    process.env.AI_FALLBACK_TIMEOUT_MS,
    DEFAULT_FALLBACK_TIMEOUT_MS,
    5_000,
    120_000,
  );
}

/** Timeout usado para chamadas de embedding, configurável via `AI_EMBEDDING_TIMEOUT_MS`. */
export function resolveEmbeddingTimeoutMs(): number {
  return readBoundedInteger(
    process.env.AI_EMBEDDING_TIMEOUT_MS,
    DEFAULT_GATEWAY_TIMEOUT_MS,
    5_000,
    120_000,
  );
}

/**
 * POST genérico no formato Chat Completions. `includeMetadata` existe porque só o LiteLLM local
 * aceita/usa os campos `user`/`metadata` hoje — Groq e OpenAI ignoram silenciosamente, mas
 * mandá-los mesmo assim vazaria o `agentContext` (nome interno do agente/serviço) para um
 * provedor externo sem necessidade.
 */
export async function requestChatCompletion(
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

  const data = (await response.json()) as ChatCompletionResponse;
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('O provedor retornou uma resposta vazia.');
  }
  return data;
}
