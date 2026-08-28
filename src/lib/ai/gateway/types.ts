/**
 * Tipos compartilhados do gateway de IA (ITEM-09). Nenhuma lógica aqui — só as formas de dados
 * que atravessam roteamento de provedor, retry/circuit-breaker, parsing e telemetria. Mantido
 * separado para que qualquer módulo (provider adapter, parsing, telemetry) dependa só do
 * contrato, nunca da implementação de outro módulo irmão.
 */
import type { BaseMessage } from '@langchain/core/messages';
import type { PromptId } from './prompt-registry.js';

export type ChatCompletionRole = 'system' | 'user' | 'assistant';

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

/** Resposta normalizada no formato Chat Completions (OpenAI-compatible) — contrato comum entre
 * Groq, OpenAI e LiteLLM/Ollama, os três adapters deste gateway. */
export interface ChatCompletionResponse {
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    total_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

export interface AiStreamChunk {
  delta: string;
}

export interface AiStreamResult {
  model: string;
  usage: AiTokenUsage;
}

export interface AiUsageLogInput {
  model: string;
  usage: AiTokenUsage;
  latencyMs: number;
  // Aceita qualquer string (compat com os ~16 pontos de chamada existentes fora da camada de
  // gateway) mas oferece autocompletar/checagem para os valores já catalogados em
  // ./prompt-registry.ts — ver o comentário desse arquivo para o motivo de não migrar todos os
  // call sites para o tipo estrito `PromptId` nesta correção.
  promptId?: PromptId | (string & {});
}

/** Nome lógico de cada adapter de provedor — usado como chave do circuit breaker, rótulo de
 * métrica/telemetria e na mensagem de erro agregada quando todos os provedores falham. */
export type ProviderName = 'groq' | 'openai' | 'litellm' | 'embedding';
